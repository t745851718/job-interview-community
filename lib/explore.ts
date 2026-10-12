export type ExplorePost = {
  id: string;
  userId: string;
  author: string;
  companyId: string | null;
  company: string;
  createdAt: number;
  interviewAt: number;
  title: string;
  role: string;
  hasAudio: boolean;
  isDemo?: boolean;
};

export type ExplorePerspective = 'user' | 'company';
export type ExploreNode = {
  id: string;
  kind: 'root' | 'user' | 'company' | 'date' | 'post';
  label: string;
  count: number;
  isDemo: boolean;
  children: ExploreNode[];
  post?: ExplorePost;
};

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function publicationDay(timestamp: number) {
  const parts = dayFormatter.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Group identities, not display names: two users with the same nickname remain distinct.
export function buildExploreTree(posts: ExplorePost[], perspective: ExplorePerspective): ExploreNode {
  const root: ExploreNode = {id: 'root', kind: 'root', label: '面试经历', count: 0, isDemo: false, children: []};
  const index = new Map<string, ExploreNode>();
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    root.count++;
    const user = {kind: 'user' as const, key: post.userId, label: post.author};
    const company = {kind: 'company' as const, key: post.companyId ?? `legacy:${post.company}`, label: post.company};
    const day = publicationDay(post.interviewAt);
    const levels = [perspective === 'user' ? user : company, perspective === 'user' ? company : user,
      {kind: 'date' as const, key: day, label: day}];
    let parent = root;
    const path: string[] = [perspective];
    for (const level of levels) {
      path.push(level.kind, level.key);
      const id = JSON.stringify(path);
      let node = index.get(id);
      if (!node) {
        node = {id, kind: level.kind, label: level.label, count: 0, isDemo: !!post.isDemo, children: []};
        index.set(id, node);
        parent.children.push(node);
      }
      node.count++;
      node.isDemo = node.isDemo && !!post.isDemo;
      parent = node;
    }
    parent.children.push({id: JSON.stringify([...path, 'post', post.id]), kind: 'post', label: post.title,
      count: 1, isDemo: !!post.isDemo, children: [], post});
  }
  return root;
}
