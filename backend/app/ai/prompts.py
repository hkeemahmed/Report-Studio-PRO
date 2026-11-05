"""Prompt templates for writer / editor / research / analysis actions."""

SYSTEM = ("You are the writing assistant of Report Studio PRO, an academic and professional report editor. "
          "Write in {lang_name}. Use clear, formal {style} style. Return only the requested content — no "
          "preamble, no explanations. Use Markdown headings (#, ##) and lists only when structure is requested. "
          "Never invent references, statistics, quotes or DOIs. If information is missing, say so or leave a "
          "clearly marked placeholder like [needs source].")

ACTIONS = {
    # AI Writer
    "full_report": "Write a complete {report_type} report titled \"{title}\" of roughly {pages} pages. Structure: {structure}. Use # for chapter headings and ## for sub-headings.",
    "introduction": "Write an introduction for a {report_type} report titled \"{title}\".",
    "conclusion": "Write a conclusion for the report titled \"{title}\" based on this content:\n\n{text}",
    "objectives": "Write a numbered list of clear, measurable objectives for a report titled \"{title}\".",
    "abstract": "Write an abstract (150-250 words) for this report:\n\n{text}",
    "chapters": "Propose a chapter outline (chapter headings with 2-4 sub-headings each) for a {report_type} report titled \"{title}\". Use # and ## Markdown headings only.",
    "subheadings": "Propose sub-headings for this section:\n\n{text}",
    "section": "Write the section \"{heading}\" for the report titled \"{title}\".",
    # AI Editor (selection based)
    "improve": "Improve the writing of the following text while keeping its meaning and language:\n\n{text}",
    "rewrite": "Rewrite the following text in different words, same meaning and language:\n\n{text}",
    "expand": "Expand the following text with more detail and explanation, same language:\n\n{text}",
    "summarize": "Summarize the following text concisely, same language:\n\n{text}",
    "shorten": "Shorten the following text by about half while keeping key points:\n\n{text}",
    "correct": "Correct spelling, grammar and punctuation errors in the following text. Change nothing else:\n\n{text}",
    "academic": "Rewrite the following text in a formal academic register, same language:\n\n{text}",
    "translate": "Translate the following text into {target_lang}. Return only the translation:\n\n{text}",
    "explain": "Explain the following text simply, in {lang_name}:\n\n{text}",
    "citations": ("For the following text, identify claims that need a citation and describe what kind of source "
                  "would support each. Do NOT invent specific references:\n\n{text}"),
    # AI Analysis
    "analyze_data": "Analyze the following data. Describe key patterns, compare values and note limitations:\n\n{text}",
    "make_table": "Convert the following information into a Markdown table:\n\n{text}",
    "suggest_chart": ("Suggest the most appropriate chart type (bar, line, pie, scatter) for this data and respond "
                      "ONLY with JSON: {{\"type\": ..., \"title\": ..., \"labels\": [...], \"series\": [{{\"name\": ..., \"data\": [...]}}]}}\n\n{text}"),
    "discussion": "Write a discussion and conclusions section based on these experiment results:\n\n{text}",
    "review": ("Review this report text for writing quality. Report: repetition, missing standard sections, unclear "
               "sentences, and give an overall quality score out of 10 with justification:\n\n{text}"),
}

LANG_NAMES = {"ar": "Arabic", "en": "English"}


def build_messages(action: str, params: dict) -> list[dict]:
    if action not in ACTIONS:
        raise KeyError(action)
    lang = params.get("language", "ar")
    p = {"title": "", "report_type": "academic", "pages": 5, "structure": "standard", "text": "", "heading": "",
         "target_lang": "English" if lang == "ar" else "Arabic", **params}
    p["lang_name"] = LANG_NAMES.get(lang, lang)
    style = "academic" if p.get("report_type") in ("academic", "research", "scientific", "university") else "professional"
    sys = SYSTEM.format(lang_name=p["lang_name"], style=style)
    if params.get("instructions"):
        sys += "\nAdditional user instructions: " + str(params["instructions"])[:1000]
    return [{"role": "system", "content": sys}, {"role": "user", "content": ACTIONS[action].format(**p)}]


RAG_SYSTEM = ("Answer the question using ONLY the numbered source excerpts provided. After each claim, cite the "
              "excerpt id in square brackets, e.g. [S2]. If the excerpts do not contain the answer, reply exactly: "
              "\"The provided sources do not contain this information.\" (or the Arabic equivalent: "
              "\"لا تحتوي المصادر المرفوعة على هذه المعلومة.\"). Never cite an id that was not provided. Answer in {lang_name}.")
