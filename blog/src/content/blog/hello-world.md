---
title: Hello, DDyu
description: 博客的第一篇文章，介绍站点结构与写作方式。
date: 2026-09-12
tags: [站点]
---

这是 DDyu 博客的第一篇文章。站点由两部分组成：

- **首页（即这里）**：博客，文章用 Markdown 写作，静态发布。
- **[创意工坊](/studio/)**：AI 创作工坊，支持对话、生图与图编。

## 文章结构

每篇文章是一个 Markdown 文件，frontmatter 如下：

```yaml
---
title: 文章标题
description: 一句话摘要
date: 2026-09-12
tags: [标签一, 标签二]
draft: false
---
```

`draft: true` 的文章不会出现在列表、RSS 和搜索结果里。

## 代码高亮

代码块使用 Shiki 高亮，支持浅色 / 深色双主题：

```go
func main() {
    fmt.Println("Hello, DDyu")
}
```

后续会在这里记录工程、工具与日常。
