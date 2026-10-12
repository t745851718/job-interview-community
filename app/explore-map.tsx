'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {AlertCircle, ArrowUpRight, Briefcase, CalendarDays, ChevronRight, FileText, GitBranch,
  Headphones, LoaderCircle, Maximize2, Minus, Plus, RotateCcw, UserRound} from 'lucide-react';
import {buildExploreTree, type ExploreNode, type ExplorePost, type ExplorePerspective} from '../lib/explore';
import {demoExperiences, type DemoExperience} from '../lib/explore-demo';

type Props = {
  category: string; query: string; sort: string; audioOnly: boolean; mine: boolean;
  companyId: string; refreshKey: number; onOpenPost: (id: string) => void;
  onOpenDemo: (post: DemoExperience) => void;
};
type Page = {posts: ExplorePost[]; total: number; hasMore: boolean};
const demoPreference = 'mianshu:explore:show-demo';
const icons = {root: GitBranch, user: UserRound, company: Briefcase, date: CalendarDays, post: FileText};

export default function ExploreMap(props: Props) {
  const {category, query, sort, audioOnly, mine, companyId, refreshKey, onOpenPost, onOpenDemo} = props;
  const [perspective, setPerspective] = useState<ExplorePerspective>('user');
  const [showDemo, setShowDemo] = useState(false);
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [total, setTotal] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filters = new URLSearchParams({category, q: query, sort, audio: audioOnly ? '1' : '0', mine: mine ? '1' : '0', companyId}).toString();
  const requestSerial = useRef(0);

  useEffect(() => {
    try {setShowDemo(localStorage.getItem(demoPreference) !== '0');} catch {setShowDemo(true);}
  }, []);

  // Reset pages synchronously with filter identity; stale responses never enter the new tree.
  const datasetKey = `${filters}&revision=${refreshKey}`;
  const dataset = useRef(datasetKey);
  const effectivePage = dataset.current === datasetKey ? page : 0;
  useEffect(() => {
    const changed = dataset.current !== datasetKey;
    if (changed) {dataset.current = datasetKey; setPage(0); setPosts([]); setTotal(0); setHasMore(false); setCollapsed(new Set());}
    const controller = new AbortController(), serial = ++requestSerial.current;
    setLoading(true); setError('');
    fetch(`/api/explore?${filters}&offset=${effectivePage * 200}`, {signal: controller.signal})
      .then(async response => {
        const data = await response.json() as Page & {error?: string};
        if (!response.ok) throw new Error(data.error || '分支视图加载失败');
        if (serial !== requestSerial.current || controller.signal.aborted) return;
        setPosts(old => effectivePage ? [...new Map([...old, ...data.posts].map(p => [p.id, p])).values()] : data.posts);
        setTotal(data.total); setHasMore(data.hasMore);
      })
      .catch(e => {if (!controller.signal.aborted && serial === requestSerial.current) setError(e.message || '分支视图加载失败');})
      .finally(() => {if (!controller.signal.aborted && serial === requestSerial.current) setLoading(false);});
    return () => controller.abort();
  }, [filters, datasetKey, effectivePage, retry]);

  const demos = useMemo(() => {
    if (!showDemo || mine || audioOnly || companyId || category !== '全部' && !['技术研发', '产品设计', '运营市场'].includes(category)) return [];
    const term = query.trim().toLocaleLowerCase();
    return demoExperiences.filter(p => {
      const direction = p.role === '产品设计师' ? '产品设计' : p.role === '用户运营' ? '运营市场' : '技术研发';
      return (category === '全部' || category === direction) && (!term || [p.title, p.author, p.company, p.role, p.markdown].join(' ').toLocaleLowerCase().includes(term));
    });
  }, [showDemo, mine, audioOnly, companyId, category, query]);
  const tree = useMemo(() => buildExploreTree([...posts, ...demos].sort((a, b) => b.interviewAt - a.interviewAt || a.id.localeCompare(b.id)), perspective), [posts, demos, perspective]);
  const positioned = useRef('');
  const positionKey = `${datasetKey}|${perspective}|${showDemo}`;
  useEffect(() => {
    if (loading || !tree.count || positioned.current === positionKey) return;
    positioned.current = positionKey;
    const viewport = scrollRef.current;
    if (viewport) {viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2); viewport.scrollLeft = 0;}
  }, [loading, tree.count, positionKey]);

  function toggleNode(id: string) {
    setCollapsed(old => {const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next;});
  }
  function resetCanvas() {setZoom(1); const canvas=scrollRef.current; canvas?.scrollTo({top: Math.max(0, (canvas.scrollHeight-canvas.clientHeight)/2), left: 0, behavior: 'smooth'});}
  function renderNode(node: ExploreNode): React.ReactNode {
    const Icon = icons[node.kind];
    const closed = collapsed.has(node.id);
    if (node.post) {
      const post = node.post;
      const href = post.isDemo ? `/?view=map&demo=${encodeURIComponent(post.id)}` : `/?post=${encodeURIComponent(post.id)}`;
      return <div className="map-branch" key={node.id}><a className={`map-node map-post ${node.isDemo ? 'map-demo-node' : ''}`} href={href}
        title={`${post.title} · ${post.role} · 面试时间：${new Date(post.interviewAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`}
        onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (post.isDemo) {const demo = demoExperiences.find(p => p.id === post.id); if (demo) onOpenDemo(demo);} else onOpenPost(post.id);
        }}><FileText size={15}/><span><strong>{post.title}</strong><small>{post.role}{post.hasAudio && <><Headphones size={11}/>有音频</>}</small></span>{node.isDemo && <em>演示</em>}<ArrowUpRight size={14}/></a></div>;
    }
    return <div className="map-branch" key={node.id}>
      <button className={`map-node map-${node.kind} ${node.isDemo ? 'map-demo-node' : ''}`} aria-expanded={!closed}
        aria-label={`${node.label}，${node.count} 篇经历，${closed ? '展开' : '收起'}`} onClick={() => toggleNode(node.id)} title={node.label}>
        <Icon size={16}/><span>{node.label}</span>{node.isDemo && <em>演示</em>}<small>{node.count}</small><ChevronRight className={closed ? '' : 'map-chevron-open'} size={13}/>
      </button>
      {!closed && !!node.children.length && <div className="map-children">{node.children.map(renderNode)}</div>}
    </div>;
  }

  return <section className="explore-map" aria-label="面试经历分支浏览">
    <div className="map-toolbar"><div className="map-perspective" role="group" aria-label="分组角度">
      <button aria-pressed={perspective === 'user'} className={perspective === 'user' ? 'selected' : ''} onClick={() => {setPerspective('user');setCollapsed(new Set());resetCanvas();}}><UserRound size={15}/>按用户</button>
      <button aria-pressed={perspective === 'company'} className={perspective === 'company' ? 'selected' : ''} onClick={() => {setPerspective('company');setCollapsed(new Set());resetCanvas();}}><Briefcase size={15}/>按公司</button>
    </div><label className="map-demo-switch"><input type="checkbox" checked={showDemo} onChange={e => {const value = e.target.checked;setShowDemo(value);try {localStorage.setItem(demoPreference, value ? '1' : '0');} catch {}}}/><span>显示演示数据</span></label></div>
    <div className="map-explanation"><span>{perspective === 'user' ? '用户 → 公司 → 面试时间 → 经历链接' : '公司 → 用户 → 面试时间 → 经历链接'}</span><span>点击节点展开 / 收起 · 北京时间，未填写则使用提交时间</span></div>
    <div className="map-controls"><div role="status">{loading ? <LoaderCircle size={13} className="spin"/> : <GitBranch size={13}/>}<span>真实经历 {posts.length} / {total}{showDemo && ` · 演示 ${demos.length} 篇`}</span></div><div>
      <button onClick={() => setCollapsed(new Set())}>全部展开</button><button onClick={() => setCollapsed(new Set(tree.children.map(n => n.id)))}>收起分支</button>
      <span className="map-control-divider"/><button aria-label="缩小分支视图" disabled={zoom <= .65} onClick={() => setZoom(z => Math.max(.65, Math.round((z - .15) * 100) / 100))}><Minus size={14}/></button>
      <span className="map-zoom">{Math.round(zoom * 100)}%</span><button aria-label="放大分支视图" disabled={zoom >= 1.6} onClick={() => setZoom(z => Math.min(1.6, Math.round((z + .15) * 100) / 100))}><Plus size={14}/></button><button aria-label="重置视图" title="重置视图" onClick={resetCanvas}><Maximize2 size={14}/></button>
    </div></div>
    {showDemo && <p className="map-demo-note">虚线节点为虚拟用户和演示公司，仅用于预览，不计入社区统计。关闭开关即可隐藏。</p>}
    {error && <div className="map-error" role="alert"><AlertCircle size={16}/><span>{error}</span><button onClick={() => setRetry(r => r + 1)}><RotateCcw size={13}/>重试</button></div>}
    <div className="map-viewport" ref={scrollRef} tabIndex={0} role="region" aria-label="可滚动的面经分支图">
      {tree.count ? <div className="map-canvas" style={{zoom}}>{renderNode(tree)}</div> : <div className="map-empty">{loading ? <><LoaderCircle className="spin" size={28}/><h3>正在整理经历分支…</h3></> : <><GitBranch size={32}/><h3>{error ? '暂时无法加载真实经历' : '还没有匹配的经历分支'}</h3><p>{showDemo ? '试试其他关键词或筛选条件。' : '清除筛选，或打开“显示演示数据”预览效果。'}</p></>}</div>}
    </div>
    {hasMore && <button className="btn secondary map-load-more" disabled={loading || !!error} onClick={() => setPage(p => p + 1)}>{loading ? '正在加载…' : '继续加载真实经历'}<ChevronRight size={14}/></button>}
    <p className="map-footnote">拖动滚动条查看分支；经历链接支持在新标签页打开。演示数据开关会在此浏览器中记住。</p>
  </section>;
}
