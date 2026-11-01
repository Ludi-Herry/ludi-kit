import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, ArrowDown, Play, X, Check, SlidersHorizontal, Undo2, Sun, Moon, Layers, Palette, ScanLine, GitBranch, FileText, Code2, CheckCheck, ChevronRight } from 'lucide-react';
import { useReducedMotion, useReveals, useSpringPointer } from './motion.js';
import copy from './copy.json';
import './tokens.css';
import './styles.css';

const editor = 'http://127.0.0.1:5393/editor';
const product = 'http://127.0.0.1:5393/device-ops/devices';
const pages = [
  { name: '设备管理', src: '/media/product-devices.png', caption: '设备生命周期 · 全部设备' },
  { name: '运营工作台', src: '/media/product-dashboard.png', caption: '天枢运营管理平台 · 工作台' },
  { name: '固件与推送', src: '/media/product-firmware.png', caption: '系统配置 · 固件与推送' }
];
const foundations = ['AntD', 'shadcn', 'CloudAI', 'HiUI'];
const layerNames = ['视觉', '控件', '结构', '逻辑'];
const layerDetails = ['主色、字号、圆角', '尺寸、边框、状态', '列宽、顺序、区块', '筛选、确认、反馈'];
const layerNotes = ['沿用设计变量，避免各自猜颜色和字级。', '逐项对齐控件规格，处理组件库的默认差异。', '检查页面结构，颜色相同还需要位置与宽度相符。', '对照同一业务流程，外观之外也要检查交互。'];

function Brand() { return <a href="#product" className="wordmark" aria-label="Ludi Design 首页"><span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span><strong>ludi<span>design</span></strong></a>; }
function Magnetic({ children, className = '', href, ...props }) {
  const { box, layer } = useSpringPointer();
  const Element = href ? 'a' : 'button';
  return <span ref={box} className="magnet"><Element ref={layer} href={href} className={`button ${className}`} {...props}>{children}</Element></span>;
}
function Image({ src, alt, eager = false, ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <div className="media-unavailable" role="img" aria-label={alt}><ScanLine size={26}/><span>产品画面暂时无法加载</span><a href={product} target="_blank" rel="noreferrer">打开实际页面 <ArrowUpRight size={15}/></a></div>;
  return <img src={src} alt={alt} width="1600" height="1000" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} onError={() => setFailed(true)} {...props}/>;
}
function Segmented({ names, selected, onChange, label, className = '' }) {
  return <div className={`segmented ${className}`} role="group" aria-label={label} style={{'--selected': selected, '--segments': names.length}}><span className="segment-slide" aria-hidden="true"/>{names.map((name,i) => <button key={name} aria-pressed={selected === i} onClick={() => onChange(i)}>{name}</button>)}</div>;
}
function SectionHeading({ label, line1, line2, description, centered = false }) {
  return <div className={`section-heading ${centered ? 'centered' : ''}`} data-reveal="text"><span className="eyebrow">{label}</span><h2>{line1}{line2 && <><br/><span className="muted-title">{line2}</span></>}</h2>{description && <p>{description}</p>}</div>;
}
function Header({ dark, setDark }) {
  return <header className="header"><div className="container header-inner"><Brand/><nav aria-label="主导航"><a href="#principles">设计标准</a><a href="#foundations">组件底座</a><a href="#workflow">工作流程</a><a href="#demo">实际操作</a></nav><div className="header-actions"><button className="theme-toggle" aria-label={dark ? '切换浅色外观' : '切换深色外观'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><a className="header-cta" href="#results">看实际效果 <ArrowUpRight size={15}/></a></div></div></header>;
}
function Hero({ onDemo }) {
  const [view, setView] = useState(0);
  const { box, layer } = useSpringPointer({ tilt: true });
  return <section className="hero container" id="product">
    <div className="hero-heading"><span className="eyebrow"><span className="live-dot"/> {copy.hero.eyebrow}</span><h1><span>{copy.hero.titleLine1}</span><span className="accent-text">{copy.hero.titleLine2}</span></h1><p>{copy.hero.description}</p><div className="hero-actions"><Magnetic href="#results" className="primary">{copy.hero.primary}<ArrowRight size={17}/></Magnetic><Magnetic className="secondary" onClick={onDemo}><Play size={14} fill="currentColor"/>{copy.hero.secondary}</Magnetic></div></div>
    <div className="hero-stage hero-entry" id="results"><div className="stage-glow" aria-hidden="true"/><div className="stage-label"><span><span className="live-dot"/> 真实产品页面</span><span>LUDI DESIGN / TIANSHU</span></div><div ref={box} className="product-perspective"><div ref={layer} className="product-frame"><div className="product-topbar"><span className="window-dots" aria-hidden="true"><i/><i/><i/></span><span>{pages[view].caption}</span><a href={view === 0 ? product : view === 1 ? 'http://127.0.0.1:5393/device-ops/dashboard' : 'http://127.0.0.1:5393/device-ops/system/firmware'} target="_blank" rel="noreferrer" aria-label={`打开${pages[view].name}实际页面`}><ArrowUpRight size={14}/></a></div><div className="product-image" key={view}><Image src={pages[view].src} alt={`天枢真实业务页面：${pages[view].caption}`} eager/></div></div></div><div className="stage-bottom"><span>从规则，到可以操作的页面。</span><Segmented names={pages.map(p => p.name)} selected={view} onChange={setView} label="查看真实业务页面"/></div></div>
    <div className="hero-foot"><span>设计有依据</span><span>生成有规则</span><span>结果可检查</span><a href="#principles" aria-label="继续了解设计标准"><ArrowDown size={19}/></a></div>
  </section>;
}
function RuleIllustration({ ordered }) {
  return <div className={`rule-preview ${ordered ? 'ordered' : 'loose'}`} aria-label={ordered ? '统一规则后的布局示意' : '未统一规则的布局示意'}><div className="rule-preview-heading"><span className="rule-icon"><Layers size={18}/></span><div><strong>项目交付</strong><small>设计 · 页面 · 组件</small></div><span className="rule-status">进行中</span></div><div className="rule-preview-content">{['设计规范','组件样式','页面结构'].map((name,i) => <div key={name} className={`rule-row row-${i}`}><span className="rule-number">0{i+1}</span><span>{name}</span><Check size={15}/></div>)}</div><div className="rule-preview-footer"><span>同一套视觉规则</span><span className="illustrated-button">查看页面 <ArrowUpRight size={14}/></span></div></div>;
}
function Principles() {
  const [selected, setSelected] = useState(0);
  const [ordered, setOrdered] = useState(true);
  const icons = [<FileText size={21}/>,<Layers size={21}/>,<ScanLine size={21}/>,<GitBranch size={21}/>];
  return <section className="section principles-section container" id="principles"><SectionHeading label="01 / 设计标准" line1={copy.principles.title} description={copy.principles.description}/><div className="principle-layout"><div className="principle-list" data-reveal="list">{copy.principles.items.map((item,i) => <button key={item.problem} className={selected === i ? 'active' : ''} onClick={() => setSelected(i)} aria-pressed={selected === i}><span className="principle-icon">{icons[i]}</span><div><small>{item.problem}</small><h3>{item.title}</h3><p>{item.description}</p></div><ChevronRight size={17}/></button>)}</div><div className="principle-stage" data-reveal="weight"><div className="proof-label"><span>规则怎样进入页面</span><span>流程示意</span></div><div className="principle-proof" key={selected}>{selected === 0 ? <div className="contract-proof"><div className="paper-heading"><FileText size={22}/><span>项目设计合同</span></div>{[['需求','页面意图与业务状态'],['设计','变量、组件与布局规则'],['底座','框架、版本与导入范围'],['验收','构建、交互与视觉检查']].map(([key,text]) => <div className="contract-row" key={key}><span>{key}</span><strong>{text}</strong><Check size={15}/></div>)}<div className="contract-footer"><Code2 size={17}/><span>生成与检查，读同一份合同。</span></div></div> : selected === 1 ? <div className="order-proof"><Segmented names={['规则前','规则后']} selected={ordered ? 1 : 0} onChange={i => setOrdered(i === 1)} label="切换布局规则示意"/><RuleIllustration ordered={ordered}/></div> : selected === 2 ? <div className="alignment-proof"><div className="alignment-source"><Palette size={24}/><strong>设计来源</strong><span>颜色 / 字级 / 间距 / 圆角</span></div><div className="alignment-link"><span/><ScanLine size={22}/><span/></div><div className="alignment-destination"><Layers size={24}/><strong>组件与页面</strong><span>变量绑定 / 状态 / 结构</span></div><p>技术检查发现问题，视觉复核确认效果。</p></div> : <div className="layers-proof">{layerNames.map((name,i) => <div className="spec-layer" key={name} style={{'--order':i}}><span>0{i+1}</span><strong>{name}</strong><small>{layerDetails[i]}</small><Check size={15}/></div>)}<p>逐层处理默认差异，逐层检查结果。</p></div>}</div><div className="proof-bottom"><span className="tiny-rule"/><span>让规则可读取，让偏差可定位。</span></div></div></div></section>;
}
function Foundations() {
  const [foundation, setFoundation] = useState(0);
  const [layer, setLayer] = useState(0);
  return <section className="foundation-section" id="foundations"><div className="container section"><SectionHeading label="02 / 跨组件库适配" line1={copy.comparison.titleLine1} line2={copy.comparison.titleLine2} description={copy.comparison.description}/><div className="foundation-board" data-reveal="weight"><div className="foundation-top"><span className="board-title"><GitBranch size={17}/> 设计标准与组件底座</span><span className="diagram-tag">适配流程示意</span></div><div className="foundation-diagram"><div className="shared-spec"><span className="mono-label">DESIGN SPEC</span><h3>同一套<br/>设计标准。</h3><div className="spec-controls" role="group" aria-label="查看适配层">{layerNames.map((name,i) => <button key={name} aria-pressed={layer===i} onClick={() => setLayer(i)}>{name}<ChevronRight size={14}/></button>)}</div></div><div className="translation-line" aria-hidden="true"><span/><ArrowRight size={22}/><span/></div><div className="foundation-target"><Segmented names={foundations} selected={foundation} onChange={setFoundation} label="切换组件底座示意"/><div className="adapter-detail" key={`${foundation}-${layer}`}><span className="mono-label">{foundations[foundation]} / {layerNames[layer]}适配</span><div className="adapter-symbol"><span/><span/><span/><span/></div><h4>{layerDetails[layer]}</h4><p>{layerNotes[layer]}</p><div className="adapter-flow"><span>规格</span><ArrowRight size={13}/><span>适配</span><ArrowRight size={13}/><span>预览与验收</span></div></div></div></div><div className="foundation-bottom"><span><CheckCheck size={16}/> 当前展示四种底座的适配方法</span><span>{copy.comparison.note}</span></div></div><div className="foundation-caption"><p>统一颜色只是开始，控件、结构和业务交互也要一起对齐。</p><span>视觉 / 控件 / 结构 / 逻辑</span></div></div></section>;
}
function Workflow() {
  const [step,setStep] = useState(0);
  const examples = [
    { title:'先说明，要做什么。', label:'需求与页面意图', rows:['谁来用，完成什么任务','页面范围与业务状态','真实设计来源'] },
    { title:'把设计标准，交给 AI。', label:'项目合同与 design pack', rows:['选定组件底座与版本','冻结主题、布局与组件规则','定义允许修改的范围'] },
    { title:'从结构，到每个细节。', label:'布局 → 模块 → 细节', rows:['先确定页面结构','按语义选择组件','补齐状态与交互'] },
    { title:'能运行，还要符合设计。', label:'技术检查 + 视觉复核', rows:['构建与真实交互检查','视觉偏差回到对应规则','导出前端工程与交接包'] }
  ];
  return <section className="section workflow-section container" id="workflow"><SectionHeading label="03 / 从需求到交付" line1={copy.workflow.titleLine1} line2={copy.workflow.titleLine2} description={copy.workflow.description} centered/><div className="workflow-steps" role="group" aria-label="查看生成与交付步骤" data-reveal="list">{copy.workflow.steps.map((item,i) => <button key={item.title} className={step === i ? 'active' : ''} aria-pressed={step === i} onClick={() => setStep(i)}><span className="workflow-number">0{i+1}</span><h3>{item.title}</h3><p>{item.description}</p><ArrowRight size={16}/></button>)}</div><div className="workflow-detail" data-reveal="weight"><div className="workflow-detail-copy" key={`text-${step}`}><span className="eyebrow">STEP 0{step+1}</span><h3>{examples[step].title}</h3><p>{examples[step].label}</p></div><div className="workflow-sheet" key={step}><div className="sheet-top"><FileText size={16}/><span>{examples[step].label}</span><span>流程示意</span></div>{examples[step].rows.map((row,i) => <div className="sheet-row" key={row}><span className="sheet-point">{i+1}</span><span>{row}</span><Check size={14}/></div>)}</div></div></section>;
}
function Demo({ onDemo }) {
  const [view,setView] = useState(0);
  const sources = ['/media/editor-overview.png','/media/editor-colors.png','/media/editor-components.png'];
  return <section className="section demo-section container" id="demo"><SectionHeading label="04 / 看实际操作" line1={copy.demo.titleLine1} line2={copy.demo.titleLine2} description={copy.demo.description}/><div className="demo-layout" data-reveal="image"><div className="demo-view"><button className="video-poster" onClick={onDemo} aria-label="播放真实产品录屏"><Image src={sources[view]} alt={['编辑器页面画布实拍','全局颜色设计规则实拍','Button组件状态矩阵实拍'][view]}/><span className="play-orb"><Play size={25} fill="currentColor"/></span><span className="video-duration">00:24 / 实录</span></button><div className="demo-image-footer"><Segmented names={['页面画布','设计变量','组件状态']} selected={view} onChange={setView} label="查看编辑器操作画面"/><span>天枢示例 · 本地原型</span></div></div><div className="demo-aside"><span className="eyebrow">把规则用起来</span><h3>{copy.demo.asideTitleLine1}<br/>{copy.demo.asideTitleLine2}</h3><p>{copy.demo.asideDescription}</p><div className="demo-facts"><span><Layers size={16}/> 页面画布</span><span><Palette size={16}/> 颜色面板</span><span><SlidersHorizontal size={16}/> Button 矩阵</span></div><button className="text-button" onClick={onDemo}>观看 24 秒实录 <ArrowUpRight size={16}/></button><small>录屏展示页面、颜色与 Button 的导航，未执行项目写入。</small></div></div></section>;
}
function Feel() {
  const [radius,setRadius] = useState(12);
  const [style,setStyle] = useState(0);
  const [on,setOn] = useState(true);
  const [confirmed,setConfirmed] = useState(false);
  const timer = useRef();
  const specimen = useRef();
  const animation = useRef();
  const reduced = useReducedMotion();
  useEffect(() => () => { clearTimeout(timer.current); animation.current?.cancel(); },[]);
  const confirm = () => {
    setConfirmed(true); clearTimeout(timer.current); timer.current=setTimeout(() => setConfirmed(false),2200);
    animation.current?.cancel();
    if(!reduced) animation.current=specimen.current.animate([{transform:'scale(1)'},{transform:'scale(1.025,.978)',offset:.18},{transform:'scale(.989,1.011)',offset:.42},{transform:'scale(1.004,.997)',offset:.7},{transform:'scale(1)'}],{duration:650,easing:'ease-out'});
  };
  return <section className="section feel-section container" id="feel"><SectionHeading label="05 / 亲手感受" line1={copy.feel.titleLine1} line2={copy.feel.titleLine2} description={copy.feel.description}/><div className="feel-board" data-reveal="weight" style={{'--sample-radius':`${radius}px`}}><div className="feel-controls"><span className="eyebrow">规则联动示意</span><h3>一个参数，<br/>影响整组组件。</h3><div className="control-line"><label htmlFor="design-radius">圆角</label><output>{radius} px</output></div><input id="design-radius" type="range" min="4" max="24" value={radius} onChange={e => setRadius(Number(e.target.value))}/><div className="radius-presets">{[4,12,24].map(value => <button key={value} aria-label={`圆角 ${value} 像素`} aria-pressed={radius===value} onClick={() => setRadius(value)}><span style={{borderRadius:`${value/2}px`}}/></button>)}</div><span className="control-label">按钮样式</span><Segmented names={['填充','描边','柔和']} selected={style} onChange={setStyle} label="切换示意按钮样式"/><button className="reset-button" onClick={() => {setRadius(12);setStyle(0);setOn(true);setConfirmed(false);clearTimeout(timer.current);}}><Undo2 size={14}/>恢复默认</button></div><div className="feel-specimen" ref={specimen}><div className="specimen-tag">INTERACTIVE / DESIGN TOKENS</div><div className="sample-card"><div className="sample-card-heading"><span className="sample-card-icon"><Layers size={23}/></span><span className="sample-chip">预览</span></div><h4>每个细节，<br/>来自同一套规则。</h4><p>圆角同步应用到面板、按钮和标签。</p><div className="sample-switch-row"><div><strong>设计反馈</strong><span>{on ? '通知已开启' : '通知已关闭'}</span></div><button className={`sample-switch ${on?'on':''}`} role="switch" aria-label="切换示意通知" aria-checked={on} onClick={() => setOn(!on)}><span/></button></div><Magnetic className={`sample-button style-${style}`} onClick={confirm}>{confirmed?<><Check size={17}/>已确认</>:<>确认设计<ArrowUpRight size={17}/></>}</Magnetic></div><span className="specimen-caption" aria-live="polite">{confirmed?'轻轻回弹，清楚反馈。':'调整圆角，切换样式，再点一下。'}</span></div></div><p className="section-note">官网交互示意，用于说明规则联动与动效手感。</p></section>;
}
function Closing() { return <section className="closing container" data-reveal="text"><span className="closing-emblem" aria-hidden="true"><i/><i/><i/><i/></span><h2>{copy.closing.titleLine1}<br/><span className="accent-text">{copy.closing.titleLine2}</span></h2><p>{copy.closing.description}</p><Magnetic className="primary" href={product} target="_blank" rel="noreferrer">{copy.closing.button}<ArrowUpRight size={17}/></Magnetic><div className="closing-links"><a href={editor} target="_blank" rel="noreferrer">查看辅助编辑器 <ArrowUpRight size={13}/></a><a href="#workflow">了解交付流程 <ArrowRight size={13}/></a></div><span className="availability">当前为本地预览。跨组件库整页视觉仍需验收。</span></section>; }
function VideoModal({open,onClose}) {
  const dialog=useRef(); const video=useRef(); const [failed,setFailed]=useState(false);
  useEffect(() => { if(open){setFailed(false);dialog.current.showModal();}else{video.current?.pause();dialog.current.close();} },[open]);
  return <dialog ref={dialog} className="video-dialog" aria-label="真实产品操作录屏" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="video-header"><span>实际操作 / 00:24</span><button onClick={onClose} aria-label="关闭录屏"><X size={20}/></button></div>{failed?<div className="video-unavailable"><p>录屏暂时无法播放</p><a href={editor} target="_blank" rel="noreferrer">打开实际编辑器 <ArrowUpRight size={16}/></a></div>:open&&<video ref={video} controls playsInline preload="metadata" poster="/media/editor-overview.png" onError={()=>setFailed(true)}><source src="/media/editor-demo-short.webm" type="video/webm"/></video>}<p className="video-note">本地实录 · 页面与组件导航 · 未执行项目写入</p></dialog>;
}
function App() {
  const [dark,setDark]=useState(false); const [demo,setDemo]=useState(false); const root=useRef();
  useReveals(root,'formal');
  useEffect(()=>{document.documentElement.dataset.appearance=dark?'dark':'light';document.documentElement.dataset.direction='stage';},[dark]);
  return <div ref={root} className="website"><a className="skip" href="#product">跳到产品介绍</a><Header dark={dark} setDark={setDark}/><main><Hero onDemo={()=>setDemo(true)}/><Principles/><Foundations/><Workflow/><Demo onDemo={()=>setDemo(true)}/><Feel/><Closing/></main><footer className="footer container"><Brand/><p>{copy.footer}</p><a href="#product">回到顶部 <ArrowUpRight size={15}/></a></footer><VideoModal open={demo} onClose={()=>setDemo(false)}/></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
