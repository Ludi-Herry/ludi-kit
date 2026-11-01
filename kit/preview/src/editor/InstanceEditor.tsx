import { useEffect, useState } from "react";
import { Button, Input, InputNumber, Select, Switch } from "antd";
import type { InstanceChanges, InstanceModel, SlotValue, StructureDraft, StylePatch } from "./api";
import "./instance-editor.css";

const NUMBERS: Array<[string,string,number,number]> = [["fontSize","字号",10,32],["fontWeight","字重",100,900],["lineHeight","行高",1,3],["paddingTop","内边距 上",0,96],["paddingRight","内边距 右",0,96],["paddingBottom","内边距 下",0,96],["paddingLeft","内边距 左",0,96],["gap","间隔",0,96],["borderRadius","圆角",0,32],["borderWidth","边框宽度",0,8],["width","宽度",0,960],["height","高度",0,960]];
const ICONS = ["SearchOutlined","PlusOutlined","ReloadOutlined","DeleteOutlined","InfoCircleOutlined","CheckOutlined","CloseOutlined"];
export function StructureEditor({component,parts,values,partKey,onChange,disabled}: {component:string;parts:string[];values:StructureDraft;partKey:string|null;onChange:(part:string,fields:StylePatch)=>void;disabled:boolean}) {
  const [part,setPart] = useState(parts[0] ?? "root");
  const [colors,setColors] = useState({color:"#1f2937",backgroundColor:"#ffffff"});
  useEffect(() => {setPart(partKey && parts.includes(partKey) ? partKey : parts[0] ?? "root");},[component,partKey,parts.join("|")]);
  useEffect(() => {setColors({color:String(values[part]?.color ?? "#1f2937"),backgroundColor:String(values[part]?.backgroundColor ?? "#ffffff")});},[part,values[part]?.color,values[part]?.backgroundColor]);
  return <section className="ludi-group ludi-instance-editor"><h3>结构层样式</h3>
    <Select aria-label={`${component} 结构层`} disabled={disabled} value={part} onChange={setPart} options={parts.map(value=>({value,label:value}))} />
    {NUMBERS.map(([key,label,min,max])=><label className="ludi-instance-row" key={key}><span>{label}</span><InputNumber aria-label={`${component}.${part}.${key}`} size="small" disabled={disabled} min={min} max={max} step={key==="lineHeight"?0.1:1} value={typeof values[part]?.[key]==="number"?values[part][key] as number:null} onChange={value=>{if(value!==null)onChange(part,{[key]:value});}} /><Button size="small" disabled={disabled || values[part]?.[key]===undefined || values[part]?.[key]===null} onClick={()=>onChange(part,{[key]:null})}>恢复</Button></label>)}
    <details><summary>文字与背景颜色</summary><label>文字<Input aria-label={`${component}.${part}.color`} value={colors.color} disabled={disabled} onChange={e=>setColors({...colors,color:e.target.value})}/></label><label>背景<Input aria-label={`${component}.${part}.backgroundColor`} value={colors.backgroundColor} disabled={disabled} onChange={e=>setColors({...colors,backgroundColor:e.target.value})}/></label><Button size="small" disabled={disabled||!Object.values(colors).every(c=>/^#[0-9a-f]{6}$/i.test(c))} onClick={()=>onChange(part,colors)}>预览这组颜色</Button><p className="ludi-muted">文字与背景一起校验；源码写入要求对比度至少 4.5:1。</p></details>
  </section>;
}
// 实例样式写入逻辑（「更多设置」里的结构层样式与右栏「外观」共用，不复制两份）：
// 把某一层的若干样式字段合进实例改动；值为 null 且源码里本来没有这一项时直接移除草稿项。
export function applyStyleFields(model:InstanceModel,changes:InstanceChanges|undefined,part:string,fields:StylePatch):InstanceChanges{
  const nextStyles={...changes?.styles},nextFields={...nextStyles[part]};
  for(const [key,value] of Object.entries(fields)){
    if(value===null&&model.styles?.value?.[part]?.[key]===undefined)delete nextFields[key];
    else nextFields[key]=value;
  }
  if(Object.keys(nextFields).length)nextStyles[part]=nextFields;else delete nextStyles[part];
  const next={...changes};if(Object.keys(nextStyles).length)next.styles=nextStyles;else delete next.styles;
  return next;
}
// 重复节点没有稳定标识、带 key 的实例没有选中具体项时不能单独改。
export function instanceBlocked(model:InstanceModel,instanceKey:string|null,disabled:boolean):boolean{
  return disabled||model.identity.kind==="repeated"||(model.identity.kind==="keyed"&&!instanceKey);
}
export function InstanceEditor({model,pending,error,changes,instanceKey,onChange,disabled}: {model:InstanceModel|null;pending:boolean;error:string|null;changes:InstanceChanges|undefined;instanceKey:string|null;onChange:(changes:InstanceChanges)=>void;disabled:boolean}) {
  if(pending)return <div className="ludi-muted">读取可编辑字段…</div>;
  if(error)return <p className="ludi-muted">{error}</p>;
  if(!model)return null;
  const blocked=instanceBlocked(model,instanceKey,disabled);
  const updateProp=(name:string,value:string|boolean|null)=>onChange({...changes,props:{...changes?.props,[name]:value}});
  const styles:StructureDraft={...model.styles?.value};
  for(const [part,fields] of Object.entries(changes?.styles??{}))styles[part]={...styles[part],...fields};
  return <div className="ludi-instance-editor"><section className="ludi-group"><h3>实例内容与属性</h3><p className="ludi-muted">{model.identity.kind==="single"?"修改当前源码节点。":model.identity.kind==="keyed"?`仅修改稳定标识 ${instanceKey??"未找到"} 的实例。`:"重复节点没有可证明的稳定标识，暂不能单独修改。"}</p>
    {model.text.writable?<label>文案<Input aria-label="实例文案" disabled={blocked} maxLength={500} value={changes?.text??model.text.value??""} onChange={e=>onChange({...changes,text:e.target.value})}/></label>:<p className="ludi-muted">文案只读：{model.text.reason}</p>}
    {model.fields.map(field=>{const value=changes?.props&&Object.prototype.hasOwnProperty.call(changes.props,field.name)?changes.props[field.name]:field.value;return <label className="ludi-instance-field" key={field.name}><span>{field.label} <code>{field.name}</code></span>{!field.writable?<small>{field.reason}</small>:field.type==="boolean"?<Switch aria-label={`实例 ${field.name}`} size="small" disabled={blocked} checked={value===true} onChange={next=>updateProp(field.name,next)}/>:field.type==="enum"?<Select aria-label={`实例 ${field.name}`} disabled={blocked} value={typeof value==="string"?value:undefined} options={field.options?.map(v=>({label:v,value:v}))} onChange={next=>updateProp(field.name,next)}/>:<Input aria-label={`实例 ${field.name}`} disabled={blocked} maxLength={500} value={typeof value==="string"?value:""} onChange={e=>updateProp(field.name,e.target.value)}/>}</label>;})}
  </section><section className="ludi-group"><h3>插槽替换</h3>{model.slots.length===0?<p className="ludi-muted">该节点没有登记插槽。</p>:model.slots.map(s=>{const value=changes?.slots?.[s.name]??s.value??{kind:"none"};const choice=value.kind==="icon"?value.name:value.kind;const set=(next:SlotValue)=>onChange({...changes,slots:{...changes?.slots,[s.name]:next}});return <label className="ludi-instance-field" key={s.name}><span>{s.label} <code>{s.name}</code></span>{!s.writable?<small>{s.reason}</small>:<><Select aria-label={`插槽 ${s.name}`} disabled={blocked} value={choice} options={[{value:"none",label:"移除"},{value:"text",label:"文本"},{value:"tag",label:"标签"},...ICONS.map(icon=>({value:icon,label:icon}))]} onChange={next=>set(next==="none"?{kind:"none"}:next==="text"||next==="tag"?{kind:next,text:"内容"}:{kind:"icon",name:next})}/>{value.kind==="text"||value.kind==="tag"?<Input aria-label={`插槽 ${s.name} 内容`} value={value.text} disabled={blocked} maxLength={value.kind==="tag"?100:200} onChange={e=>set({...value,text:e.target.value})}/>:null}</>}</label>;})}</section>
    {model.styles?.writable?<StructureEditor component={model.component} parts={model.parts} values={styles} partKey={null} disabled={blocked} onChange={(part,fields)=>onChange(applyStyleFields(model,changes,part,fields))}/>:<p className="ludi-muted">结构样式只读：{model.styles?.reason}</p>}
  </div>;
}
