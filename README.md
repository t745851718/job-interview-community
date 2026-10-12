# 面述 · 面试经历社区

项目名称：`job-interview-community`。主源码仓库：[t745851718/job-interview-community](https://github.com/t745851718/job-interview-community)，默认分支为 `main`。

面向访客开放阅读的中文面试经历社区。使用 Sites 原生 ChatGPT 登录；首次登录自动创建数据库用户档案，用户可设置公开昵称。没有独立邮箱密码注册流程。

## 产品能力

- 访客首页浏览、搜索、方向筛选、按发布时间/评论数量排序、分页加载。
- 用户发布 Markdown 面经，实时预览，提供写作模板。
- 支持 MP3、M4A、WAV、OGG、WebM、AAC、FLAC 音频，单文件最大 25MB。
- 音频使用浏览器原生播放器，后端支持 Range 读取。
- 登录后评论，仅作者可以删除自己的经历或评论。
- 匿名用户可读取面经、评论，听音频和下载 Markdown 文件。

## 数据

Cloudflare D1 的 `users` 存储站点用户 ID、邮箱、昵称和注册时间；公开接口不暴露邮箱。`posts` 只保存经历元数据、作者、摘要和文件引用。`comments` 保存评论内容和作者。

Cloudflare R2 文件路径为 `posts/<id>/experience.md` 和 `posts/<id>/audio`。文件由后端读取，不向客户端暴露内部对象键。删除自己的经历会删除其元数据、评论和文件。

数据结构见 `db/schema.ts`，迁移由 Drizzle 生成。身份由 Sites 注入的可信请求头确定；不要自行信任客户端传来的用户 ID。写接口校验登录身份、来源、字段长度、音频类型和发布频率。Markdown 通过 React 渲染，不执行原始 HTML，不加载第三方 Markdown 图片。

## 开发与部署

从 GitHub 获取源码：

```bash
git clone https://github.com/t745851718/job-interview-community.git
cd job-interview-community
```

这是私有仓库，克隆时需要使用有访问权限的 GitHub 账号。后续源码修改以此仓库的 `main` 分支为准。GitHub 提交不会自动触发 Sites 部署；发布时仍需通过 Sites 的构建和发布流程，将同一份源码同步至其托管仓库。

保留 `.openai/hosting.json` 中的 Site 身份、DB 和 BUCKET 绑定。运行 Sites 的依赖安装及构建辅助脚本，或使用 package.json 中的开发/构建脚本。通过 Sites 托管流程发布，平台负责托管存储资源和应用数据库迁移。

生产数据库初始为空；UI 内的格式示例明确标注为非用户发布，不写入生产数据库。

## 共享公司选择

公司输入使用 Wikidata 企业条目和社区共享企业库。所有面经通过 `posts.company_id` 关联 `companies`，不再根据自由输入的字符串分组。

- 优先检索站内已有公司；没有匹配时搜索 Wikidata，也可点击“再查 Wikidata”获取更多候选。
- Wikidata 实体通过 P31/P279 分类路径过滤为公司或企业，保存实体 ID、中文/英文名称、别名、简介和安全 HTTP(S) 官网链接。所有条目保留 Wikidata 来源链接，不能当作工商认证。
- 未收录公司可由登录用户在发布时创建为社区记录，之后的用户可搜索并选择同一个 ID；来源显示“社区录入”。规范化名称设置唯一约束，重复或并发录入复用同一记录，不做模糊名称自动合并。
- 以前的纯文本公司在读取列表或搜索时分批归入社区记录；不猜测它对应哪个 Wikidata 企业。
- 社区公司不依赖 Wikidata 的可用性。搜索请求失败时允许重试或创建社区公司；已缓存的企业条目仍可选择。
- 公司记录在原始面经删除后继续保留，供后续用户选择。支持按统一公司 ID 查看该公司的所有面经。

外部来源为免费的 Wikidata Action API 与 Query Service，不需要 API Key。请求包含站点 User-Agent、超时、输入防抖和缓存；分类和名称反映开放知识库条目，不保证完整工商覆盖。
