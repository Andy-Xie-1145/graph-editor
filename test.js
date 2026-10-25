// Graph Editor 回归测试：从 index.html 提取真实代码（纯算法 + 播放器）验证
// 运行：node test.js
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/function algAdj\(graph, u\)\{[\s\S]*?function visitIndexOf\(id\)\{[\s\S]*?\n\}/);
if (!m){ console.error('FAIL: 未找到算法代码块'); process.exit(1); }

const harness = `
let nodes = [], edges = [], directed = false, traversal = null;
const chipEl = { hidden: true, textContent: '' };
const nodeById = id => nodes.find(n => n.id === id);
const nodeLabel = id => { const n = nodeById(id); return n ? n.label : '?'; };
const fmtW = w => Number.isInteger(w) ? String(w) : String(Math.round(w * 100) / 100);
const intervalDelay = () => 330;
globalThis.__toasts = [];
function toast(msg){ globalThis.__toasts.push(String(msg)); }
${m[0]}
globalThis.__GE = {
  setGraph(ns, es, dir){ nodes = ns; edges = es; directed = !!dir; traversal = null; },
  get traversal(){ return traversal; },
  computeOrder: (g, o) => computeOrder(g, o),
  computeShortest: (g, o) => computeShortest(g, o),
  start: (s, k, t) => startTraversal(s, k, t),
  runAll(){ let guard = 0; while (traversal && !traversal.finished && guard++ < 20000) stepTraversal(); return guard; },
  chip: () => chipEl.textContent,
  toasts: () => globalThis.__toasts,
  clearToasts(){ globalThis.__toasts.length = 0; },
};
`;
eval(harness);
const GE = globalThis.__GE;

let pass = 0, fail = 0;
function check(name, cond){ cond ? (pass++, console.log('  PASS ' + name)) : (fail++, console.log('  FAIL ' + name)); }
function mkNodes(n){ return Array.from({ length: n }, (_, i) => ({ id: i + 1, label: String(i), x: 0, y: 0 })); }
function bellman(ns, es, s, dir){
  const dist = new Map(ns.map(n => [n.id, Infinity])); dist.set(s, 0);
  for (let i = 0; i < ns.length; i++){
    let changed = false;
    for (const e of es){
      const rel = (f, t, w) => { if (Number.isFinite(dist.get(f)) && dist.get(f) + w < dist.get(t)){ dist.set(t, dist.get(f) + w); changed = true; } };
      rel(e.from, e.to, e.weight);
      if (!dir) rel(e.to, e.from, e.weight);
    }
    if (!changed) break;
  }
  return dist;
}
function fixedSample(){
  const ns = mkNodes(6);
  const E = [[1,2,4],[1,3,2],[2,3,1],[2,4,5],[3,4,8],[3,5,10],[4,5,2],[5,6,6],[6,1,7]];
  return [ns, E.map(([a,b,w],i) => ({ id:i+1, from:a, to:b, weight:w }))];
}

console.log('T1: BFS/DFS 动画 + 幽灵边回归（播放器）');
for (const kind of ['bfs', 'dfs']){
  const [ns, es] = fixedSample();
  GE.setGraph(ns, es, false);
  GE.start(1, kind, null);
  let threw = null;
  try { GE.runAll(); } catch (e){ threw = e; }
  check(`${kind} 无异常`, threw === null);
  check(`${kind} 6 节点各一次`, GE.traversal.order.length === 6 && new Set(GE.traversal.order).size === 6);
  const ns2 = mkNodes(6);
  const es2 = [[0,1,4],[0,2,2],[1,2,1],[1,3,5],[2,3,8],[2,4,10],[3,4,2],[4,5,6],[5,0,7]].map(([a,b,w],i)=>({id:i+1,from:a,to:b,weight:w}));
  GE.setGraph(ns2, es2, false);
  GE.start(2, kind, null);
  GE.runAll();
  check(`${kind} 幽灵边回归`, !GE.traversal.order.includes(0) && !GE.chip().includes('?'));
}

console.log('T2: 纯函数直接调用（新接口，无需桩环境）');
{
  const [ns, es] = fixedSample();
  const g = { nodes: ns, edges: es, directed: false };
  const r = GE.computeOrder(g, { start: 1, kind: 'dfs' });
  check('纯函数 DFS 直接可用', r.order.length === 6);
  const r2 = GE.computeShortest(g, { start: 1, kind: 'dijkstra', target: 5 });
  check('纯函数 Dijkstra 距离正确', r2.dist.get(5) === 10);
  check('纯函数无 timer 字段污染播放器', r2.finished === false);
}

console.log('T3: Dijkstra 负权警告运行');
{
  const ns = mkNodes(3);
  const es = [{id:1,from:1,to:2,weight:5},{id:2,from:3,to:2,weight:-2}];
  GE.setGraph(ns, es, true);
  GE.clearToasts();
  GE.start(1, 'dijkstra', 2);
  GE.runAll();
  check('警告运行', GE.traversal !== null && GE.toasts().some(s => s.includes('负权')) && GE.chip().includes('结果可能错误'));
}

console.log('T4: 算法对拍（40 组 × 2 算法）');
for (const kind of ['dijkstra', 'spfa']){
  let ok = true;
  for (let trial = 0; trial < 40 && ok; trial++){
    const n = 8;
    const ns = mkNodes(n);
    const es = [];
    for (let i = 0; i < 16; i++){
      let a = 1 + Math.floor(Math.random() * n), b = 1 + Math.floor(Math.random() * n);
      if (a === b) b = a % n + 1;
      es.push({ id: es.length + 1, from: a, to: b, weight: Math.floor(Math.random() * 10) });
    }
    const dir = trial % 2 === 0;
    GE.setGraph(ns, es, dir);
    const s = 1 + Math.floor(Math.random() * n);
    GE.start(s, kind, null);
    GE.runAll();
    const got = GE.traversal.dist, want = bellman(ns, es, s, dir);
    for (const nd of ns) if (got.get(nd.id) !== want.get(nd.id)){ ok = false; break; }
  }
  check(`${kind} 对拍一致`, ok);
}

console.log('T5: SPFA 负环标准判定 + 队列光环清空');
{
  const ns = mkNodes(4);
  const es = [{id:1,from:1,to:2,weight:1},{id:2,from:2,to:3,weight:-3},{id:3,from:3,to:2,weight:1},{id:4,from:3,to:4,weight:1}];
  GE.setGraph(ns, es, true);
  GE.start(1, 'spfa', null);
  const guard = GE.runAll();
  check('负环标准判定', guard < 20000 && GE.traversal.negCycle === true && GE.traversal.negEnqCount === 4);
  check('chip 报告入队达 4 次', GE.chip().includes('入队达 4 次'));
  check('环高亮 e2/e3', GE.traversal.cycEdges.has(2) && GE.traversal.cycEdges.has(3));
  check('结束后队列光环清空', GE.traversal.onQueueNow.size === 0);
}
{
  const ns = mkNodes(4);
  const es = [{id:1,from:1,to:2,weight:3},{id:2,from:1,to:3,weight:5},{id:3,from:3,to:4,weight:2},{id:4,from:4,to:2,weight:-1}];
  GE.setGraph(ns, es, true);
  GE.start(1, 'spfa', 2);
  GE.runAll();
  check('无负环时队列光环也清空', GE.traversal.onQueueNow.size === 0);
}

console.log('T6: 负自环（新修复）');
{
  const ns = mkNodes(3);
  const es = [{id:1,from:1,to:2,weight:2},{id:2,from:2,to:2,weight:-1}];
  GE.setGraph(ns, es, true);
  GE.clearToasts();
  GE.start(1, 'spfa', null);
  GE.runAll();
  check('负自环被报告', GE.traversal.negCycle === true && GE.traversal.negSelfLoop && GE.traversal.negSelfLoop.node === 2);
  check('负自环高亮 e2', GE.traversal.cycEdges.has(2));
  check('chip 显示负自环', GE.chip().includes('负自环'));
  // 不可达的负自环不应报告
  const ns2 = mkNodes(3);
  const es2 = [{id:1,from:1,to:2,weight:2},{id:2,from:3,to:3,weight:-1}];
  GE.setGraph(ns2, es2, true);
  GE.start(1, 'spfa', null);
  GE.runAll();
  check('不可达负自环不误报', GE.traversal.negCycle === false);
}

console.log('T7: SPFA 负权 DAG + 不可达 + 路径校验');
{
  const ns = mkNodes(4);
  const es = [{id:1,from:1,to:2,weight:5},{id:2,from:1,to:3,weight:6},{id:3,from:3,to:2,weight:-2}];
  GE.setGraph(ns, es, true);
  GE.start(1, 'spfa', 2);
  GE.runAll();
  check('负权 DAG dist=4', GE.traversal.dist.get(2) === 4);
  check('路径 0 → 2 → 1', GE.chip().includes('路径 0 → 2 → 1'));
}
{
  const ns = mkNodes(3);
  const es = [{id:1,from:2,to:3,weight:1}];
  GE.setGraph(ns, es, true);
  GE.start(1, 'dijkstra', 3);
  GE.runAll();
  check('不可达提示', GE.chip().includes('不可达'));
}
{
  const [ns, es] = fixedSample();
  GE.setGraph(ns, es, false);
  GE.start(1, 'dijkstra', 5);
  GE.runAll();
  const t = GE.traversal;
  const sum = [...t.pathEdges].reduce((s, eid) => s + es.find(e => e.id === eid).weight, 0);
  check('路径权重校验', sum === t.dist.get(5));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
