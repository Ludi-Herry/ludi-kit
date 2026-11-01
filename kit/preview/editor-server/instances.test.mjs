import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, walk, imports, component } from './ast.mjs';
import { inspectInstance, changeInstance, previewTransform, normalizeStyles, SEMANTIC_PARTS, STYLE_FIELDS } from './instances.mjs';

function locFor(source, wanted) {
  const ast = parse(source), bindings = imports(ast); let found;
  walk(ast, node => {
    if (!found && node.type === 'JSXElement' && component(node.openingElement.name, bindings) === wanted) found = { ...node.openingElement.loc.start, component: wanted };
  });
  return found;
}

test('keyed instance changes static text, display props, semantic styles and a registered slot without touching behavior', () => {
  const source = [
    'import { Button as ActionButton } from "antd";',
    'import { SearchOutlined } from "@ant-design/icons";',
    'const rows = [{ id: "a" }, { id: "b" }];',
    'const act = (id: string) => id;',
    'export function DemoPage() {',
    '  return <>{rows.map((item) => <ActionButton key={item.id} type="default" icon={<SearchOutlined />} onClick={() => act(item.id)} styles={{ root: { paddingTop: 4 }, content: { fontWeight: 400 } }}>Open</ActionButton>)}</>;',
    '}'
  ].join('\r\n');
  const loc = locFor(source, 'Button'), inspected = inspectInstance(source, loc);
  assert.deepEqual(inspected.identity, { kind: 'keyed', expression: 'String(item.id)' });
  assert.equal(inspected.fields.find(item => item.name === 'type').value, 'default');
  assert.deepEqual(inspected.slots[0].value, { kind: 'icon', name: 'SearchOutlined' });
  assert.ok(inspected.parts.includes('content'));

  const output = changeInstance(source, loc, 'a', {
    props: { type: 'primary', block: true, size: 'medium' },
    text: 'Inspect',
    slots: { icon: { kind: 'icon', name: 'PlusOutlined' } },
    styles: {
      root: { fontSize: 16, color: '#ffffff', backgroundColor: '#000000' },
      content: { fontWeight: 600 }
    }
  });
  parse(output);
  assert.match(output, /PlusOutlined/);
  assert.match(output, /type=\{String\(item\.id\) === "a" \? "primary" : "default"\}/);
  assert.match(output, /block=\{String\(item\.id\) === "a" \? true : undefined\}/);
  assert.match(output, /\{String\(item\.id\) === "a" \? "Inspect" : "Open"\}/);
  assert.match(output, /icon=\{String\(item\.id\) === "a" \? <PlusOutlined aria-hidden="true" \/> : <SearchOutlined \/>\}/);
  assert.match(output, /styles=\{String\(item\.id\) === "a" \? \{ root: \{ paddingTop: 4, fontSize: 16, color: "#ffffff", backgroundColor: "#000000" \}, content: \{ fontWeight: 600 \} \} : \{ root: \{ paddingTop: 4 \}, content: \{ fontWeight: 400 \} \}\}/);
  assert.ok(output.includes('onClick={() => act(item.id)}'));
  assert.equal(output.replaceAll('\r\n', '').includes('\n'), false, 'CRLF source must not gain lone LF');
  const writtenLoc = locFor(output, 'Button');
  const writtenModel = inspectInstance(output, writtenLoc, 'a');
  assert.equal(writtenModel.text.writable, true);
  assert.equal(writtenModel.text.value, 'Inspect');
  assert.equal(writtenModel.fields.find(item => item.name === 'type').value, 'primary');
  assert.equal(writtenModel.fields.find(item => item.name === 'size').value, 'medium');
  const revised = changeInstance(output, writtenLoc, 'a', { text: 'Inspect again', styles: { content: { fontWeight: 700 } } });
  assert.equal(inspectInstance(revised, locFor(revised, 'Button'), 'a').text.value, 'Inspect again');
  assert.equal(inspectInstance(revised, locFor(revised, 'Button'), 'b').text.value, 'Open');
  const other = changeInstance(revised, locFor(revised, 'Button'), 'b', { text: 'Second row' });
  assert.equal(inspectInstance(other, locFor(other, 'Button'), 'a').text.value, 'Inspect again');
  assert.equal(inspectInstance(other, locFor(other, 'Button'), 'b').text.value, 'Second row');
  assert.ok(other.includes('onClick={() => act(item.id)}'));
  const final = changeInstance(other, locFor(other, 'Button'), 'a', {text:'Final'});
  assert.ok(final.includes('String(item.id) === "a" ? "Final" : String(item.id) === "b" ? "Second row" : "Open"'));
  assert.equal(final.includes('Inspect again'), false, 're-edit must replace the prior key branch');
  const preview = previewTransform(source, 'DemoPage.tsx');
  const target = preview.targets.find(item => item.loc.line === loc.line && item.loc.column === loc.column);
  assert.deepEqual(target.identity, inspected.identity);
  assert.equal(target.text.range.start < target.text.range.end, true);
  assert.equal(target.originalStyles.value.root.paddingTop, 4);
  assert.ok(SEMANTIC_PARTS.Table.includes('header.cell'));
  assert.deepEqual(STYLE_FIELDS.borderRadius, { type: 'number', min: 0, max: 32 });
});

test('dynamic props and eventful slots stay read-only; repeated, spread, unsafe color and bounds are rejected', () => {
  const dynamic = [
    'import { Button, Tag } from "antd";',
    'const kind = "primary";',
    'const run = () => undefined;',
    'export const Demo = () => <Button type={kind} icon={<Tag onClick={run}>Hot</Tag>}>Go</Button>;'
  ].join('\n');
  const loc = locFor(dynamic, 'Button'), inspected = inspectInstance(dynamic, loc);
  assert.equal(inspected.fields.find(item => item.name === 'type').writable, false);
  assert.equal(inspected.slots[0].writable, false);
  assert.throws(() => changeInstance(dynamic, loc, null, { props: { type: 'default' } }), /动态表达式/);
  assert.throws(() => changeInstance(dynamic, loc, null, { props: { size: 'middle' } }), /不在允许选项/);
  assert.throws(() => changeInstance(dynamic, loc, null, { slots: { icon: { kind: 'none' } } }), /事件/);
  assert.throws(() => changeInstance(dynamic, loc, null, { styles: { root: { fontSize: 99 } } }), /10–32/);
  assert.throws(() => normalizeStyles({ root: { color: '#ffffff' } }), /必须同时提供/);
  assert.throws(() => normalizeStyles({ root: { color: '#777777', backgroundColor: '#ffffff' } }), /低于 4.5:1/);

  const repeated = 'import { Button } from "antd"; const rows = [1, 2]; export const Demo = () => <>{rows.map((item) => <Button type="link">Open</Button>)}</>;';
  const repeatedLoc = locFor(repeated, 'Button');
  assert.equal(inspectInstance(repeated, repeatedLoc).identity.kind, 'repeated');
  assert.throws(() => changeInstance(repeated, repeatedLoc, '1', { text: 'Inspect' }), /稳定 key/);
  const reused = 'import { Button } from "antd"; const Action = () => <Button onClick={() => undefined}>Open</Button>; export const Demo = () => <><Action/><Action/></>;';
  const reusedLoc = locFor(reused, 'Button');
  assert.equal(inspectInstance(reused, reusedLoc).identity.kind, 'repeated');
  assert.throws(() => changeInstance(reused, reusedLoc, null, {text:'Changed'}), /稳定 key/);
  const shared = 'import { Button } from "antd"; export const SharedAction = () => <Button>Open</Button>;';
  const sharedLoc={...locFor(shared,'Button'),file:'projects/tianshu-device-ops/ui.tsx'};
  assert.equal(inspectInstance(shared,sharedLoc).identity.kind,'repeated');
  assert.throws(() => changeInstance(shared,sharedLoc,null,{text:'Changed'}), /稳定 key/);

  const spread = 'import { Button } from "antd"; const props = {}; export const Demo = () => <Button {...props}>Open</Button>;';
  assert.throws(() => inspectInstance(spread, locFor(spread, 'Button')), /展开或重复属性/);

  const native = 'export const Demo = () => <button style={{ paddingTop: 4 }}>Open</button>;';
  const nativeLoc = { line: 1, column: native.indexOf('<button'), component: 'button' };
  const nativeOutput = changeInstance(native, nativeLoc, null, { styles: { root: { paddingTop: 8 } }, props: { title: 'Open details' } });
  assert.match(nativeOutput, /style=\{\{ paddingTop: 8 \}\}/);
  assert.doesNotMatch(nativeOutput, /root:/);
  parse(nativeOutput);
});
