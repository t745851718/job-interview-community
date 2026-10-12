import type { Metadata } from 'next';
import './globals.css';
import './glass.css';
export const metadata: Metadata = { title: '面述 · 让每一次面试，成为下一次的底气', description: '分享真实面试经历，用文字与声音连接正在求职的你我。支持 Markdown 面经、音频与交流评论。' };
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="zh-CN"><body>{children}</body></html>;}
