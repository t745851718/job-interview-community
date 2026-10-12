type Draft = {title: string; company: string; role: string; markdown: string};
export function publishValidation(draft: Draft, companySelected: boolean): string | null {
  if (draft.title.trim().length < 4) return '请填写至少 4 个字符的经历标题';
  if (!draft.company.trim()) return '请填写公司名称，并选择公司或创建社区公司';
  if (!companySelected) return '请从公司候选中选中一家公司，或点击“创建社区公司”';
  if (!draft.role.trim()) return '请填写应聘岗位';
  if (draft.markdown.trim().length < 10) return '请填写至少 10 个字符的面试经历';
  return null;
}
