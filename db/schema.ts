import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull(), name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(), wikidataId: text('wikidata_id').unique(), source: text('source').notNull().default('wikidata'), communityNameKey: text('community_name_key').unique(), createdBy: text('created_by').references(() => users.id),
  name: text('name').notNull(), description: text('description').notNull(), aliases: text('aliases').notNull(),
  website: text('website'), updatedAt: integer('updated_at').notNull(),
});
export const companySearches = sqliteTable('company_searches', {
  query: text('query').primaryKey(), resultIds: text('result_ids').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(), company: text('company').notNull(), companyId: text('company_id').references(() => companies.id), companyStatus: text('company_status').notNull().default('unlinked'), role: text('role').notNull(),
  category: text('category').notNull(), outcome: text('outcome').notNull(), excerpt: text('excerpt').notNull(),
  markdownKey: text('markdown_key').notNull(), audioKey: text('audio_key'), audioType: text('audio_type'), audioName: text('audio_name'),
  createdAt: integer('created_at').notNull(),
}, t => [index('posts_created_idx').on(t.createdAt), index('posts_user_idx').on(t.userId), index('posts_company_idx').on(t.companyId)]);
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(), postId: text('post_id').notNull().references(() => posts.id, {onDelete:'cascade'}),
  userId: text('user_id').notNull().references(() => users.id), content: text('content').notNull(), createdAt: integer('created_at').notNull(),
}, t => [index('comments_post_idx').on(t.postId)]);
