import base64
import io

from PIL import Image as PILImage


def png_data_uri(color=(37, 99, 235), size=(120, 60)) -> str:
    buf = io.BytesIO()
    PILImage.new("RGB", size, color).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def t(text, *marks):
    return {"type": "text", "text": text, "marks": [{"type": m} if isinstance(m, str) else m for m in marks]}


def arabic_report(source_id="src-1"):
    return {"type": "doc", "content": [
        {"type": "coverPage", "attrs": {"title": "تقرير عن الذكاء الاصطناعي", "author": "أحمد علي",
                                        "university": "جامعة بغداد", "supervisor": "د. سارة"}},
        {"type": "tableOfContents"},
        {"type": "heading", "attrs": {"level": 1}, "content": [t("المقدمة")]},
        {"type": "paragraph", "attrs": {"textAlign": "justify"}, "content": [
            t("يعد "), t("الذكاء الاصطناعي", "bold"), t(" من أهم التقنيات في عام 2024، ويستخدم نموذج "),
            t("GPT-4", "italic"), t(" في تطبيقات كثيرة (مثل الترجمة)."),
            {"type": "citation", "attrs": {"sourceId": source_id}},
            {"type": "footnote", "attrs": {"text": "هامش توضيحي"}}]},
        {"type": "heading", "attrs": {"level": 2}, "content": [t("Methodology")]},
        {"type": "paragraph", "attrs": {"dir": "ltr"}, "content": [t("Mixed text: "), t("مرحبا بالعالم"), t(" and back to English.")]},
        {"type": "bulletList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": [t("البند الأول")]}]},
            {"type": "listItem", "content": [{"type": "paragraph", "content": [t("البند الثاني")]}]}]},
        {"type": "table", "attrs": {"caption": "نتائج التجربة"}, "content": [
            {"type": "tableRow", "content": [
                {"type": "tableHeader", "content": [{"type": "paragraph", "content": [t("العينة")]}]},
                {"type": "tableHeader", "content": [{"type": "paragraph", "content": [t("القيمة")]}]}]},
            {"type": "tableRow", "content": [
                {"type": "tableCell", "content": [{"type": "paragraph", "content": [t("أ")]}]},
                {"type": "tableCell", "attrs": {"backgroundColor": "#fef3c7"}, "content": [{"type": "paragraph", "content": [t("12.5")]}]}]},
            {"type": "tableRow", "content": [
                {"type": "tableCell", "attrs": {"colspan": 2}, "content": [{"type": "paragraph", "content": [t("خلية مدمجة")]}]}]}]},
        {"type": "image", "attrs": {"src": png_data_uri(), "caption": "مخطط توضيحي", "width": "50%"}},
        {"type": "equation", "attrs": {"latex": "E = mc^2"}},
        {"type": "pageBreak"},
        {"type": "bibliography"},
    ]}


SOURCE = {"source_type": "article", "title": "Deep learning", "authors": [
    {"given": "Yann", "family": "LeCun"}, {"given": "Yoshua", "family": "Bengio"}, {"given": "Geoffrey", "family": "Hinton"}],
    "year": "2015", "doi": "10.1038/nature14539", "data": {"journal": "Nature", "volume": "521", "issue": "7553", "pages": "436–444"}}
