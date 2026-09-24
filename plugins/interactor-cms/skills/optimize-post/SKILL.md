---
name: optimize-post
description: Make an Interactor CMS post findable by search engines (SEO), answer engines like featured snippets and AI Overviews (AEO), and AI assistants that cite sources like ChatGPT, Claude and Perplexity (GEO). Use whenever you draft a new post or substantially rewrite one, before submitting or publishing a post (post_workflow submit/publish), and whenever a writer asks to optimize, SEO, AEO or GEO a post, improve its search or AI visibility, or fill in its title, excerpt or meta description.
---

# Optimize a post for search and AI

SEO, AEO and GEO are one discipline with three audiences. Search engines rank
pages, answer engines lift a direct answer out of them, and AI assistants cite
them as sources. Almost everything that works for all three is: be the clearest,
best-evidenced answer to a real question, structured so any part of it can be
quoted.

These rules come from the Interactor CMS's research, graded by evidence
(Google Search Central and Bing guidance, the KDD 2024 *GEO* study, crawler
documentation from OpenAI, Anthropic and Perplexity). Follow them as written;
don't add tactics from general "SEO tips" that aren't here.

## When to run it

- **Drafting or rewriting.** Write to the template below from the start.
- **Before `post_workflow` submit or publish.** Run the checklist, fix what
  you can, and tell the writer what's left (see "Report").
- **When asked** ("optimize this", "make it rank", "SEO/AEO/GEO this post").

Work on the post the way `write-post` does: edit `posts/<filename>` when the
live sync is running, otherwise `edit_post_content` for small changes. Call
`checkpoint_post` before a restructure.

## The template

1. **Answer first.** The opening paragraph answers the question the title asks,
   in 40–60 words, completely enough to be quoted alone. No scene-setting
   before it.
2. **Define the subject.** Near the top, one plain sentence of the form
   "X is a …" for the main term.
3. **Headings people would ask.** Phrase most H2s as the question a reader
   would type ("How does X work?", "Is X worth it for small teams?"). Put a
   direct 1–3 sentence answer right under each heading, then the detail.
4. **Evidence.** This is the lever with the strongest research behind it for
   AI citations. Include:
   - specific numbers with their context and source ("cut build time from
     14 to 3 minutes", not "much faster");
   - a short quotation from a named person or primary source, where one fits;
   - links to primary sources (official docs, the study itself, the data),
     not to someone's summary of them.
5. **Real structure.** Numbered lists for steps, tables for comparisons,
   bulleted lists for options. The body is Markdown, so write real lists and
   tables, not paragraphs pretending to be them.
6. **Name things.** Say "Interactor Build" or "the Interactor CMS", not "our
   tool" or "it". Name people with their role. AI assistants resolve and quote
   entities; a pronoun can't be cited.
7. **Sections that stand alone.** Each section should still make sense if it's
   the only part quoted: restate the subject rather than "as mentioned above".
   But write normal prose. Don't chop the post into tiny fragments "for LLMs";
   Google has said explicitly not to.
8. **FAQ only for real questions.** A short FAQ at the end is fine when readers
   actually ask those questions. Keep it visible on the page. Don't add one to
   pad the post.
9. **First-hand value.** Say what we did, measured or decided, and why. Content
   anyone could produce by asking an AI model is what search engines and AI
   assistants now skip.

## Fields (frontmatter)

- **title:** specific, under about 60 characters, the main phrase near the
  front, no clickbait. It becomes the page title and the search result link.
- **meta_description:** 70–160 characters, unique to this post, states what
  the reader gets. Not a copy of the first sentence and not a keyword list.
- **excerpt:** 1–2 sentences for post lists and social cards. It can reuse the
  answer-first paragraph, shortened.
- **tags:** a few real topics, lowercase. Not keyword variations.
- **slug:** short, lowercase, hyphenated, meaningful. **Never change the slug
  of a published post**: its links and search rankings are tied to it.
- **Images:** every image needs alt text that describes it. The featured image
  is generated automatically at publish if the post has none; call
  `generate_featured_image` to preview or refresh it.
- **meta_keywords:** optional and ignored by Google; don't spend effort on it.

## Honesty rules (never break these)

- **Never invent a statistic, quote, source or link.** If the post needs
  evidence you don't have, ask the writer for it, or leave a visible
  `[source needed: …]` marker and list it in your report. A made-up number is
  worse than no number.
- **Never claim first-hand experience** the writer didn't give you.
- Don't promise rankings or AI citations to the writer. These practices raise
  the odds; nothing guarantees placement.

## Don't

- Keyword stuffing, or repeating a phrase to "hit a density". It scored
  *below* baseline in the GEO study and is a Google spam signal.
- FAQ blocks, or claims in the title and meta description, that the page
  doesn't actually contain.
- Bumping a date, or making a trivial edit, to make a post look fresh.
- Adding "llms.txt" advice, hidden text, or special markup to the body. The
  CMS and the website handle structured data; the post body doesn't need any.

## Report

After optimizing, or before a submit or publish, give the writer a short
checklist in chat: what you changed, and what still needs them (a source,
a number, a decision). For example:

> Optimized for search and AI:
> - ✓ Answer-first opening (52 words), definition in paragraph 2
> - ✓ 4 of 5 headings are questions
> - ✓ Meta description 148 chars; title 54 chars
> - ⚠ 2 claims need a source: the "3× faster" figure, the Gartner stat
> - ⚠ No quotation yet: a line from the customer would strengthen it

If a `check_post_seo` tool is available on the CMS connection, run it and fix
every error it reports before submitting; its warnings go in the report.
