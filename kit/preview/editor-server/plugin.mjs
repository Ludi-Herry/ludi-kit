import { resolve, relative } from 'node:path';
import { parse, walk, imports, component, jsxName, isShadowed, edits } from './ast.mjs';
import { EditorService, middleware } from './service.mjs';
import { createCheckRunner } from './checks.mjs';
import { EDITOR_PORT } from './port.mjs';
import { previewTransform } from './instances.mjs';
export { EDITOR_PORT };

// antd 中无自身 DOM、不把 data-* 透传到触发的包裹组件（本版本仅 Popconfirm）。
const NO_DOM_WRAPPERS=new Set(['Popconfirm']);
export function locate(source,file) {
  const ast=parse(source),bindings=imports(ast),changes=[];
  const targets=previewTransform(source,file).targets;
  const used=new Set();walk(ast,n=>{if(n.type==='Identifier'||n.type==='JSXIdentifier')used.add(n.name);});
  let suffix=0;while(['__ludiPreviewProps','__ludiPreviewText'].some(n=>used.has(n+suffix)))suffix++;
  const propsHook=`__ludiPreviewProps${suffix}`,textHook=`__ludiPreviewText${suffix}`;
  if(targets.length)changes.push({start:0,end:0,text:`import { previewProps as ${propsHook}, previewText as ${textHook} } from "/src/editor/instance-preview";\n`});
  for(const target of targets) {
    const key=target.identity.kind==='keyed'?target.identity.expression:'null';
    const loc=`${file}:${target.loc.line}:${target.loc.column}`;
    const opening=source.slice(target.opening.start,target.opening.end),at=target.opening.end-(opening.endsWith('/>')?2:1);
    const fields=target.fields.filter(f=>f.writable).map(f=>f.name),slots=target.slots.filter(s=>s.writable).map(s=>s.name);
    const styles=target.originalStyles;
    changes.push({start:at,end:at,text:` ${target.identity.kind==='keyed'?`data-ludi-key={${key}} `:''}{...${propsHook}(${JSON.stringify(loc)}, ${key}, ${JSON.stringify(fields)}, ${JSON.stringify(slots)}, ${JSON.stringify(styles.writable===false?null:styles.attribute)}, ${styles.code??'{}'}, ${/^[a-z]/.test(target.component)})}`});
    if(target.text.writable&&target.text.range)changes.push({...target.text.range,text:`{${textHook}(${JSON.stringify(loc)}, ${key}, ${target.text.originalCode??JSON.stringify(target.text.value)})}`});
  }
  walk(ast,(node,parents)=>{
    if(node.type!=='JSXOpeningElement')return;
    // antd 组件：具名导入（含别名与 Radio.Group）；原生元素：小写单标识符标签，data-ludi-comp 为标签名。
    // 大写非 antd 本地组件、Fragment（JSXFragment 不是 JSXOpeningElement）、成员表达式里非 antd 的、命名空间标签均不注入，
    // 它们渲染出的原生元素各自带标记。
    const antd=component(node.name,bindings),native=node.name.type==='JSXIdentifier'&&/^[a-z]/.test(node.name.name)?node.name.name:undefined;
    const comp=antd&&!isShadowed(ast,jsxName(node.name).split('.')[0],parents)?antd:native;
    if(!comp)return;
    if(node.attributes.some(a=>a.type==='JSXAttribute'&&['data-ludi-loc','data-ludi-comp'].includes(a.name.name)))return;
    const loc=`${file}:${node.loc.start.line}:${node.loc.start.column}`,at=node.typeParameters?.end??node.typeArguments?.end??node.name.end;
    changes.push({start:at,end:at,text:` data-ludi-loc=${JSON.stringify(loc)} data-ludi-comp=${JSON.stringify(comp)}`});
    if(!NO_DOM_WRAPPERS.has(comp))return;
    const parent=parents.at(-1);
    const children=(parent?.children??[]).filter(n=>n.type!=='JSXText'||n.value.trim());
    if(children.length!==1||children[0].type!=='JSXElement')return;
    const opening=children[0].openingElement,childAt=opening.typeParameters?.end??opening.typeArguments?.end??opening.name.end;
    changes.push({start:childAt,end:childAt,text:` data-ludi-owner-loc=${JSON.stringify(loc)} data-ludi-owner-comp=${JSON.stringify(comp)}`});
  });
  return changes.length?edits(source,changes):source;
}
export function editorPlugin(kitRoot) {
  kitRoot=resolve(kitRoot);
  return {name:'ludi-editor-dev',apply:'serve',enforce:'pre',
    transform(code,id){
      const absolute=resolve(id.split('?')[0]),file=relative(kitRoot,absolute).replaceAll('\\','/');
      if(!/^projects\/tianshu-device-ops\/(?:generated\/[A-Za-z]+Page|app|ui)\.tsx$/.test(file))return null;
      const result=locate(code,file);return result===code?null:{code:result,map:null};
    },
    configureServer(server){
      if(server.config.server.port!==EDITOR_PORT)return;
      if(server.config.server.host!=='127.0.0.1')throw new Error('编辑器仅允许监听 127.0.0.1');
      const service=new EditorService({root:kitRoot,runChecks:createCheckRunner(kitRoot)});
      server.middlewares.use(middleware(service,EDITOR_PORT));
    }
  };
}
