import json
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import Template, TemplateStyle

TEMPLATES_JSON = Path(__file__).resolve().parents[3] / "packages" / "template-engine" / "templates.json"


def seed_builtin_templates(db: Session):
    data = json.loads(TEMPLATES_JSON.read_text(encoding="utf-8"))
    for t in data:
        tpl = db.query(Template).filter_by(slug=t["slug"], is_builtin=True).first()
        if not tpl:
            tpl = Template(slug=t["slug"], is_builtin=True, workspace_id=None)
            db.add(tpl)
        tpl.name, tpl.name_ar, tpl.category = t["name"], t["name_ar"], t["category"]
        tpl.structure = t["structure"]
        tpl.layout = {**t["layout"], "includeToc": t["includeToc"], "includeBibliography": t["includeBibliography"]}
        db.flush()
        for key, props in t["styles"].items():
            st = db.query(TemplateStyle).filter_by(template_id=tpl.id, style_key=key).first()
            if not st:
                db.add(TemplateStyle(template_id=tpl.id, style_key=key, props=props))
            else:
                st.props = props
    db.commit()
