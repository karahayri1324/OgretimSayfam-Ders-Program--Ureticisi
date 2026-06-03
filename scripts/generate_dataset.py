#!/usr/bin/env python3
"""
Dataset generator — Türkçe doğal dil → AI constraint JSON.

Plans/03_AI_DATASET.md'deki strateji:
- 17 constraint tipi, her biri için 60-250 örnek
- İsim/cümle/weight varyasyonları
- Context block injection
- %10 belirsiz veya hatalı örnek

Çıktı: Plans/dataset_samples/<type>.jsonl
"""
import json
import random
import re
import os
from pathlib import Path

random.seed(42)  

ROOT = Path(__file__).resolve().parent.parent
DS = ROOT / "Plans" / "dataset_samples"

def read_lines(name: str) -> list[str]:
    return [line.strip() for line in (DS / name).read_text(encoding="utf-8").splitlines() if line.strip()]

TEACHERS = read_lines("names_teachers.txt")
SUBJECTS = read_lines("names_subjects.txt")
CLASSES = read_lines("names_classes.txt")
ROOMS = read_lines("names_rooms.txt")
SYSTEM_PROMPT = (DS / "system_prompt.txt").read_text(encoding="utf-8").strip()

DAYS_FULL = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]
DAYS_VARIANTS = {
    "Pazartesi": ["Pazartesi", "pazartesi", "Pzt", "pzt", "haftanın ilk günü"],
    "Salı": ["Salı", "salı", "Sal", "sal"],
    "Çarşamba": ["Çarşamba", "çarşamba", "Çar", "çar"],
    "Perşembe": ["Perşembe", "perşembe", "Per", "per"],
    "Cuma": ["Cuma", "cuma", "Cum", "cum"],
    "Cumartesi": ["Cumartesi", "cumartesi", "Cmt", "cmt", "haftanın son günü"],
}

ORDINAL_HOUR = {
    1: ["1.", "birinci", "ilk"],
    2: ["2.", "ikinci"],
    3: ["3.", "üçüncü"],
    4: ["4.", "dördüncü"],
    5: ["5.", "beşinci"],
    6: ["6.", "altıncı"],
    7: ["7.", "yedinci"],
    8: ["8.", "sekizinci"],
    9: ["9.", "dokuzuncu"],
    10: ["10.", "onuncu", "son"],
}

TEACHER_TITLES = ["hoca", "öğretmen", "Bey", "Hanım", "öğretmen", "hocam"]
HOURS_PER_DAY = 8

def random_days() -> list[str]:
    """4-6 gün arası varyasyon: 5 gün %70, 6 gün %15 (+Cumartesi), 4 gün %15 (Pzt-Per)."""
    r = random.random()
    if r < 0.70:
        return ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]
    elif r < 0.85:
        return ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"]
    else:
        return ["Pazartesi", "Salı", "Çarşamba", "Perşembe"]

def random_hours_per_day() -> int:
    """4-10 saat arası varyasyon, ağırlıklı dağılım."""

    choices = [6, 7, 8, 9, 10, 5, 4]
    weights = [0.20, 0.25, 0.35, 0.10, 0.05, 0.03, 0.02]
    return random.choices(choices, weights=weights, k=1)[0]

def first_name(full: str) -> str:
    return full.split()[0]

def teacher_phrase(t: str) -> str:
    """Çeşitli öğretmen referansı varyantları."""
    forms = [
        full := t,
        first_name(t),
        f"{first_name(t)} {random.choice(TEACHER_TITLES)}",
        f"{full} {random.choice(['öğretmen', 'hoca'])}",
    ]
    return random.choice(forms)

def day_phrase(d: str) -> str:
    return random.choice(DAYS_VARIANTS[d])

def hour_phrase(h: int, max_h: int | None = None) -> str:
    """Belirli bir saat için Türkçe ifade. max_h verilirse ve h == max_h ise 'son' da kullanılabilir."""
    variants = list(ORDINAL_HOUR[h])
    if max_h is not None and h == max_h and "son" not in variants:
        variants = variants + ["son"]
    return random.choice(variants) + " ders"

def class_phrase(c: str) -> str:
    return c

def make_context(extra_teachers=None, extra_classes=None, existing_constraints=None) -> dict:
    """Her örnek için context block (okul verisi).

    `constraints`: uygulamanın buildAIContext()'i context'e MEVCUT aktif
    kısıtlamaları da koyar (id/type/weight/active/description). Eğitim
    formatı bununla BİREBİR olmalı; aksi halde model dağıtım-dışı (OOD)
    input alır. Çoğu örnek için boş liste, kısıtlama-yönetimi (sil/gevşet/
    aktif-pasif/say) senaryolarında dolu gelir.
    """
    teacher_pool = random.sample(TEACHERS, random.randint(8, 16))
    if extra_teachers:
        for t in extra_teachers:
            if t not in teacher_pool:
                teacher_pool.append(t)
    class_pool = random.sample(CLASSES, random.randint(6, 12))
    if extra_classes:
        for c in extra_classes:
            if c not in class_pool:
                class_pool.append(c)
    return {
        "teachers": teacher_pool,
        "classes": class_pool,
        "subjects": random.sample(SUBJECTS, random.randint(6, 10)),
        "rooms": random.sample(ROOMS, random.randint(5, 8)),
        "days": random_days(),
        "hoursPerDay": random_hours_per_day(),
        "constraints": existing_constraints or [],
    }

def format_context(ctx: dict) -> str:
    constraints = ctx.get("constraints", [])
    return (
        f"[CONTEXT]\n"
        f"TEACHERS: {json.dumps(ctx['teachers'], ensure_ascii=False)}\n"
        f"CLASSES: {json.dumps(ctx['classes'], ensure_ascii=False)}\n"
        f"SUBJECTS: {json.dumps(ctx['subjects'], ensure_ascii=False)}\n"
        f"ROOMS: {json.dumps(ctx['rooms'], ensure_ascii=False)}\n"
        f"DAYS: {json.dumps(ctx['days'], ensure_ascii=False)}\n"
        f"HOURS_PER_DAY: {ctx['hoursPerDay']}\n"
        f"CONSTRAINTS: {json.dumps(constraints, ensure_ascii=False)}\n"
        f"[/CONTEXT]"
    )

def make_user_msg(ctx: dict, request: str) -> str:
    return f"{format_context(ctx)}\n\n[USER_REQUEST]\n{request}\n[/USER_REQUEST]"

def make_assistant_msg(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)

def example(ctx: dict, request: str, payload: dict) -> dict:
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": make_user_msg(ctx, request)},
            {"role": "assistant", "content": make_assistant_msg(payload)},
        ]
    }

HARD_PHRASES = ["olmasın", "yasak", "asla", "kesinlikle", "müsait değil", "yapmasın", "girmesin", "alamaz", "olmamalı"]
SOFT_PHRASES = ["olsa iyi olur", "olmasa iyi olur", "tercih ederim", "tercih ederiz", "iyi olur", "tercihen", "tercih olarak", "öncelikli olarak"]
WEAK_PHRASES = ["mümkünse", "imkân varsa", "olabiliyorsa", "olabilirse", "belki", "olabilir", "olursa"]

def weight_for(phrase: str) -> int:
    """Cümlenin ifade gücüne göre weight: zayıf→60, yumuşak→80, sert→100."""
    p = phrase.lower()
    if any(w in p for w in WEAK_PHRASES):
        return 60
    if any(s in p for s in SOFT_PHRASES):
        return 80
    return 100

SOFT_PREFIXES = ["Tercihen", "Tercih olarak", "Öncelikli olarak"]
WEAK_PREFIXES = ["Mümkünse", "İmkân varsa", "Olabiliyorsa"]

def apply_strength(request: str, base_weight: int = 100) -> tuple[str, int]:
    """İsteğe rastgele 'kesinlik' (güç) katar ve eşleşen weight'i döndürür.

    Dağılım: %62 sert (base_weight, çoğunlukla 100), %26 yumuşak (80),
    %12 zayıf (60). Önek doğal Türkçe — isteğin fiili ne olursa olsun
    dilbilgisel kalır: "Mümkünse Ahmet cuma olmasın", "Tercihen Fizik
    sabah olsun". Böylece model 100/80/60 ayrımını ifadeden öğrenir.
    """
    r = random.random()
    if r < 0.62:
        return request, base_weight
    if r < 0.88:
        return f"{random.choice(SOFT_PREFIXES)} {request}", 80
    return f"{random.choice(WEAK_PREFIXES)} {request}", 60

def explanation_for_teacher_not_available(teacher: str, slots: list, hours_per_day: int = HOURS_PER_DAY) -> str:
    if len(slots) == hours_per_day:
        days = list({s["day"] for s in slots})
        return f"{teacher} öğretmeninin {', '.join(days)} günü tüm saatlerde mevcut olmaması kısıtlaması eklendi."
    hours = sorted({s["hour"] for s in slots})
    days = list({s["day"] for s in slots})
    return f"{teacher} öğretmeninin {', '.join(days)} günü {', '.join(str(h)+'.' for h in hours)} derslerde mevcut olmaması kısıtlaması eklendi."

def gen_teacher_not_available(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        all_day = random.random() < 0.4
        if all_day:
            slots = [{"day": day, "hour": h} for h in range(1, H + 1)]
            hour_text = ""
        else:
            num_hours = random.randint(1, min(3, H))
            hours = sorted(random.sample(range(1, H + 1), num_hours))
            slots = [{"day": day, "hour": h} for h in hours]
            if len(hours) == 1:
                hour_text = f" {hour_phrase(hours[0], max_h=H)}"
            else:
                hour_text = " " + " ve ".join(ORDINAL_HOUR[h][0] for h in hours) + " derslerde"

        templates_all = [
            f"{teacher_phrase(teacher)} {day_phrase(day)} günü yok",
            f"{teacher_phrase(teacher)} {day_phrase(day)} günü olmasın",
            f"{teacher_phrase(teacher)} {day_phrase(day)} müsait değil",
            f"{day_phrase(day)} günü {teacher_phrase(teacher)} müsait değil",
            f"{teacher_phrase(teacher)} adlı öğretmen {day_phrase(day)} günü gelmeyecek",
            f"{teacher_phrase(teacher)} {day_phrase(day)} izinli",
        ]
        templates_partial = [
            f"{teacher_phrase(teacher)} {day_phrase(day)}{hour_text} olmasın",
            f"{teacher_phrase(teacher)} {day_phrase(day)}{hour_text} müsait değil",
            f"{day_phrase(day)} günü{hour_text} {teacher_phrase(teacher)} olmasın",
            f"{teacher_phrase(teacher)} hocayı {day_phrase(day)}{hour_text} koyma",
        ]
        request = random.choice(templates_all if all_day else templates_partial)

        payload = {
            "constraints": [{
                "type": "TEACHER_NOT_AVAILABLE",
                "weight": 100,
                "active": True,
                "params": {"teacher": teacher, "slots": slots},
            }],
            "confidence": round(random.uniform(0.88, 0.97), 2),
            "explanation": explanation_for_teacher_not_available(teacher, slots, hours_per_day=H),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_not_available(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        ctx = make_context(extra_classes=[cls])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        num_hours = random.randint(1, min(3, H))
        hours = sorted(random.sample(range(1, H + 1), num_hours))
        slots = [{"day": day, "hour": h} for h in hours]
        hour_text = " ve ".join(ORDINAL_HOUR[h][0] for h in hours) + " derslerde" if len(hours) > 1 else hour_phrase(hours[0], max_h=H)

        templates = [
            f"{cls} sınıfı {day_phrase(day)} {hour_text} olmasın",
            f"{cls} {day_phrase(day)} {hour_text} ders yapmasın",
            f"{cls} sınıfı {day_phrase(day)} {hour_text} müsait değil",
            f"{day_phrase(day)} günü {hour_text} {cls} için ders koyma",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "CLASS_NOT_AVAILABLE",
                "weight": 100,
                "active": True,
                "params": {"class": cls, "slots": slots},
            }],
            "confidence": round(random.uniform(0.85, 0.95), 2),
            "explanation": f"{cls} sınıfının {day} günü {', '.join(str(h)+'.' for h in hours)} derslerde mevcut olmaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_not_on_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        for_class = random.random() < 0.5
        cls = random.choice(CLASSES) if for_class else None
        ctx = make_context(extra_classes=[cls] if cls else None)
        day = random.choice(ctx["days"])

        if cls:
            templates = [
                f"{subj} dersi {day_phrase(day)} günü olmasın {cls} için",
                f"{cls} sınıfının {subj} dersi {day_phrase(day)} günü olmasın",
                f"{cls} {day_phrase(day)} günü {subj} olmasın",
                f"{day_phrase(day)} günü {cls} için {subj} dersi yapılmasın",
            ]
        else:
            templates = [
                f"{subj} dersi {day_phrase(day)} günü olmasın",
                f"{day_phrase(day)} günü {subj} olmasın",
                f"{subj} {day_phrase(day)} yapılmasın",
                f"Hiçbir sınıfta {day_phrase(day)} günü {subj} olmasın",
            ]
        request, _w = apply_strength(random.choice(templates), 100)
        params = {"subject": subj, "class": cls, "days": [day]}
        payload = {
            "constraints": [{
                "type": "SUBJECT_NOT_ON_DAY",
                "weight": _w,
                "active": True,
                "params": params,
            }],
            "confidence": round(random.uniform(0.85, 0.95), 2),
            "explanation": (
                f"{subj} dersinin {cls + ' sınıfı için ' if cls else ''}{day} günü yapılmaması kısıtlaması eklendi."
            ),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        H = ctx["hoursPerDay"]
        max_h = random.randint(2, max(2, H - 1))
        templates = [
            f"{teacher_phrase(teacher)} günde en fazla {max_h} ders",
            f"{teacher_phrase(teacher)} günde max {max_h} saat",
            f"{teacher_phrase(teacher)} bir günde {max_h} saatten fazla ders vermesin",
            f"{teacher_phrase(teacher)} günlük {max_h} dersten fazla olmasın",
        ]
        request, _w = apply_strength(random.choice(templates), 100)
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_HOURS_DAILY",
                "weight": _w,
                "active": True,
                "params": {"teacher": teacher, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.88, 0.95), 2),
            "explanation": f"{teacher} öğretmeninin günde en fazla {max_h} saat ders vermesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_days_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        num_days = len(ctx["days"])
        max_d = random.randint(2, max(2, num_days - 1))
        templates = [
            f"{teacher_phrase(teacher)} haftada en fazla {max_d} gün gelsin",
            f"{teacher_phrase(teacher)} haftada {max_d} günden fazla okula gelmesin",
            f"{teacher_phrase(teacher)} haftalık {max_d} gün ders versin",
        ]
        request, _w = apply_strength(random.choice(templates), 100)
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_DAYS_PER_WEEK",
                "weight": _w,
                "active": True,
                "params": {"teacher": teacher, "maxDays": max_d},
            }],
            "confidence": round(random.uniform(0.88, 0.95), 2),
            "explanation": f"{teacher} öğretmeninin haftada en fazla {max_d} gün okulda olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_gaps_per_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        gaps = random.randint(0, 2)
        templates = [
            f"{teacher_phrase(teacher)} günde en fazla {gaps} boş ders olsun",
            f"{teacher_phrase(teacher)} günde {gaps} boşluktan fazla olmasın",
            f"{teacher_phrase(teacher)} hocanın günlük programında {gaps} boş saatten fazla olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_GAPS_PER_DAY",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin günde en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_gaps_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        gaps = random.randint(0, 5)
        templates = [
            f"{teacher_phrase(teacher)} haftada en fazla {gaps} boş ders olsun",
            f"{teacher_phrase(teacher)} haftalık programında {gaps} boş saatten fazla olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_GAPS_PER_WEEK",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin haftada en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teachers_max_gaps_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        gaps = random.randint(1, 5)
        templates = [
            f"Tüm öğretmenler haftada en fazla {gaps} boş ders olsun",
            f"Öğretmenler haftada {gaps} boşluktan fazla olmasın",
            f"Hiçbir öğretmen haftada {gaps} boş saatten fazla almasın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "TEACHERS_MAX_GAPS_PER_WEEK",
                "weight": 80,
                "active": True,
                "params": {"maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.85, 0.92), 2),
            "explanation": f"Tüm öğretmenlerin haftada en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_max_gaps_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        gaps = random.randint(0, 3)
        templates = [
            f"{cls} sınıfının haftada en fazla {gaps} boş dersi olsun",
            f"{cls} haftada {gaps} boşluktan fazla olmasın",
            f"{cls} sınıfı haftalık programında {gaps} boş saatten fazla olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MAX_GAPS_PER_WEEK",
                "weight": 100,
                "active": True,
                "params": {"class": cls, "maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.88, 0.95), 2),
            "explanation": f"{cls} sınıfının haftada en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_preferred_hours(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        for_class = random.random() < 0.4
        cls = random.choice(CLASSES) if for_class else None
        ctx = make_context(extra_classes=[cls] if cls else None)
        H = ctx["hoursPerDay"]
        morning = random.random() < 0.6
        if morning:
            hours = list(range(1, min(random.randint(3, 5), H + 1)))
            phrase = random.choice(["sabah", "ilk derslerde", "günün başında", "öğleden önce"])
        else:
            start = max(1, min(random.randint(4, 6), H))
            hours = list(range(start, H + 1))
            phrase = random.choice(["öğleden sonra", "son derslerde", "günün sonunda"])
        if cls:
            templates = [
                f"{subj} dersi {phrase} olsun {cls} için",
                f"{cls} sınıfında {subj} {phrase} yapılsın",
            ]
        else:
            templates = [
                f"{subj} dersi {phrase} olsun",
                f"{subj} {phrase} yapılsın",
                f"{phrase} {subj} olsun",
            ]
        request, _w = apply_strength(random.choice(templates), 100)
        payload = {
            "constraints": [{
                "type": "SUBJECT_PREFERRED_HOURS",
                "weight": _w,
                "active": True,
                "params": {"subject": subj, "class": cls, "preferredHours": hours},
            }],
            "confidence": round(random.uniform(0.78, 0.90), 2),
            "explanation": (
                f"{subj} dersinin {cls + ' sınıfı için ' if cls else ''}{phrase} (saatler: {hours}) yapılması tercih ediliyor."
            ),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_last_hour(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice([s for s in SUBJECTS if s in ("Beden Eğitimi", "Müzik", "Görsel Sanatlar", "Resim", "Bilişim Teknolojileri")])
        cls = random.choice(CLASSES) if random.random() < 0.3 else None
        if cls:
            templates = [
                f"{subj} dersi son derste olsun {cls} için",
                f"{cls} sınıfında {subj} günün son saatinde olsun",
            ]
        else:
            templates = [
                f"{subj} dersi son derste olsun",
                f"{subj} günün son saatinde olsun",
                f"{subj} her zaman son derste yapılsın",
            ]
        request, _w = apply_strength(random.choice(templates), 100)
        ctx = make_context(extra_classes=[cls] if cls else None)
        payload = {
            "constraints": [{
                "type": "SUBJECT_LAST_HOUR_OF_DAY",
                "weight": _w,
                "active": True,
                "params": {"subject": subj, "class": cls},
            }],
            "confidence": round(random.uniform(0.88, 0.95), 2),
            "explanation": (
                f"{subj} dersinin {cls + ' sınıfı için ' if cls else ''}günün son saatinde olması kısıtlaması eklendi."
            ),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_max_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        cls = random.choice(CLASSES) if random.random() < 0.5 else None
        max_h = random.choice([1, 2])
        if cls:
            templates = [
                f"{subj} {cls} sınıfında günde en fazla {max_h} saat olsun",
                f"{cls} için {subj} günde {max_h} saatten fazla olmasın",
            ]
        else:
            templates = [
                f"{subj} günde en fazla {max_h} saat olsun",
                f"{subj} günde {max_h} saatten fazla yapılmasın",
                f"{subj} aynı gün {max_h} saatten fazla olmasın",
            ]
        request, _w = apply_strength(random.choice(templates), 100)
        ctx = make_context(extra_classes=[cls] if cls else None)
        payload = {
            "constraints": [{
                "type": "SUBJECT_MAX_HOURS_DAILY",
                "weight": _w,
                "active": True,
                "params": {"subject": subj, "class": cls, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": (
                f"{subj} dersinin {cls + ' sınıfında ' if cls else ''}günde en fazla {max_h} saat olması kısıtlaması eklendi."
            ),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_consecutive(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice([s for s in SUBJECTS if s in ("Resim", "Müzik", "Beden Eğitimi", "Görsel Sanatlar", "Bilişim Teknolojileri", "Türk Dili ve Edebiyatı", "Fizik", "Kimya")])
        cls = random.choice(CLASSES) if random.random() < 0.5 else None
        templates_cls = [
            f"{subj} dersi {cls} sınıfında çift saat olsun",
            f"{cls} sınıfında {subj} blok halinde yapılsın",
            f"{subj} {cls} için iki saat ardışık olsun",
        ]
        templates_all = [
            f"{subj} dersi çift saat olsun",
            f"{subj} blok halinde yapılsın",
            f"{subj} iki saat peş peşe olsun",
        ]
        request, _w = apply_strength(random.choice(templates_cls if cls else templates_all), 90)
        ctx = make_context(extra_classes=[cls] if cls else None)
        payload = {
            "constraints": [{
                "type": "SUBJECT_CONSECUTIVE_HOURS",
                "weight": _w,
                "active": True,
                "params": {"subject": subj, "class": cls, "blockDuration": 2},
            }],
            "confidence": round(random.uniform(0.82, 0.92), 2),
            "explanation": (
                f"{subj} dersinin {cls + ' sınıfı için ' if cls else ''}iki saat ardışık (blok) yapılması kısıtlaması eklendi."
            ),
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_room_not_available(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        room = random.choice(ROOMS)
        ctx = make_context()
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        all_day = random.random() < 0.5
        if all_day:
            slots = [{"day": day, "hour": h} for h in range(1, H + 1)]
        else:
            num = random.randint(1, min(3, H))
            hours = sorted(random.sample(range(1, H + 1), num))
            slots = [{"day": day, "hour": h} for h in hours]
        templates = [
            f"{room} dersliği {day_phrase(day)} günü kapalı",
            f"{room} {day_phrase(day)} kullanılmasın",
            f"{day_phrase(day)} günü {room} müsait değil",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "ROOM_NOT_AVAILABLE",
                "weight": 100,
                "active": True,
                "params": {"room": room, "slots": slots},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{room} dersliğinin {day} günü kullanılamaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_preferred_room(n: int) -> list[dict]:
    pairs = [
        ("Fizik", ["Fizik Lab", "Lab1"]),
        ("Kimya", ["Kimya Lab", "Lab2"]),
        ("Biyoloji", ["Biyoloji Lab"]),
        ("Bilişim Teknolojileri", ["Bilgisayar Lab", "BT Sınıfı"]),
        ("Müzik", ["Müzik Sınıfı"]),
        ("Görsel Sanatlar", ["Resim Atölyesi", "Görsel Sanatlar Atölyesi"]),
        ("Resim", ["Resim Atölyesi"]),
        ("Beden Eğitimi", ["Spor Salonu", "Bahçe", "Beden Salonu"]),
    ]
    out = []
    for _ in range(n):
        subj, rooms = random.choice(pairs)
        room = random.choice(rooms)
        templates = [
            f"{subj} dersleri {room}'da yapılsın",
            f"{subj} hep {room}'da olsun",
            f"{subj} {room}'da yapılmalı",
            f"Tüm {subj} dersleri {room}'da olsun",
        ]
        request, _w = apply_strength(random.choice(templates), 100)
        ctx = make_context()
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        payload = {
            "constraints": [{
                "type": "SUBJECT_PREFERRED_ROOM",
                "weight": _w,
                "active": True,
                "params": {"subject": subj, "room": room},
            }],
            "confidence": round(random.uniform(0.88, 0.95), 2),
            "explanation": f"{subj} derslerinin {room} dersliğinde yapılması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_home_room(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        room = random.choice(ROOMS)
        templates = [
            f"{teacher_phrase(teacher)} hep {room}'da ders versin",
            f"{teacher_phrase(teacher)} sürekli {room} dersliğinde olsun",
            f"{teacher_phrase(teacher)} dersleri {room}'da yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = {
            "constraints": [{
                "type": "TEACHER_HOME_ROOM",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "room": room},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin tüm dersleri {room} dersliğinde yapılması tercih ediliyor.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_home_room(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        room = random.choice([r for r in ROOMS if not any(k in r.lower() for k in ["lab", "atölye", "salon", "bahçe"])])
        templates = [
            f"{cls} sınıfının ana dersliği {room}",
            f"{cls} sürekli {room} dersliğinde olsun",
            f"{cls} {room}'da otursun",
            f"{cls} sınıfı dersleri {room}'da yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = {
            "constraints": [{
                "type": "CLASS_HOME_ROOM",
                "weight": 90,
                "active": True,
                "params": {"class": cls, "room": room},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{cls} sınıfının ana dersliği {room} olarak ayarlandı.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_combinations(n: int) -> list[dict]:
    """Tek mesajda 2-5 KARIŞIK tip kısıtlama (bileşik istek).

    Eski sürüm hep tam 2x TEACHER_NOT_AVAILABLE üretiyordu (çeşitlilik sıfır).
    Artık öğretmen/sınıf/branş/derslik karışık tiplerden 2-5 tanesi rastgele
    seçilir; istek doğal bağlaçlarla birleştirilir; weight'ler hard/soft karışık.
    """
    out = []
    for _ in range(n):
        ctx = make_context()
        D, H = ctx["days"], ctx["hoursPerDay"]
        teachers, classes = ctx["teachers"], ctx["classes"]
        subjects, rooms = ctx["subjects"], ctx["rooms"]

        def f_teacher_day():
            t = random.choice(teachers); d = random.choice(D)
            slots = [{"day": d, "hour": h} for h in range(1, H + 1)]
            return (f"{first_name(t)} {day_phrase(d)} günü yok",
                    {"type": "TEACHER_NOT_AVAILABLE", "weight": 100, "active": True,
                     "params": {"teacher": t, "slots": slots}})

        def f_teacher_maxh():
            t = random.choice(teachers); mh = random.randint(4, max(4, H - 1))
            return (f"{first_name(t)} günde en fazla {mh} ders versin",
                    {"type": "TEACHER_MAX_HOURS_DAILY", "weight": 100, "active": True,
                     "params": {"teacher": t, "maxHours": mh}})

        def f_teacher_maxdays():
            t = random.choice(teachers); md = random.randint(3, max(3, len(D) - 1))
            return (f"{first_name(t)} haftada en fazla {md} gün gelsin",
                    {"type": "TEACHER_MAX_DAYS_PER_WEEK", "weight": 100, "active": True,
                     "params": {"teacher": t, "maxDays": md}})

        def f_teacher_not_last():
            t = random.choice(teachers)
            return (f"{first_name(t)} son derste olmasın",
                    {"type": "TEACHER_NOT_LAST_HOUR", "weight": 100, "active": True,
                     "params": {"teacher": t}})

        def f_subj_not_day():
            s = random.choice(subjects); d = random.choice(D)
            return (f"{s} {day_phrase(d)} olmasın",
                    {"type": "SUBJECT_NOT_ON_DAY", "weight": 100, "active": True,
                     "params": {"subject": s, "class": None, "days": [d]}})

        def f_subj_pref_hours():
            s = random.choice(subjects)
            return (f"{s} sabah saatlerinde olsa iyi olur",
                    {"type": "SUBJECT_PREFERRED_HOURS", "weight": 80, "active": True,
                     "params": {"subject": s, "class": None, "preferredHours": [1, 2, 3]}})

        def f_subj_last():
            s = random.choice(subjects)
            return (f"{s} günün son dersi olsa iyi olur",
                    {"type": "SUBJECT_LAST_HOUR_OF_DAY", "weight": 80, "active": True,
                     "params": {"subject": s, "class": None}})

        def f_subj_room():
            s = random.choice(subjects); r = random.choice(rooms)
            return (f"{s} dersi {r} dersliğinde yapılsın",
                    {"type": "SUBJECT_PREFERRED_ROOM", "weight": 80, "active": True,
                     "params": {"subject": s, "room": r}})

        def f_class_maxh():
            c = random.choice(classes); mh = random.randint(min(5, H), H)
            return (f"{c} günde en fazla {mh} ders alsın",
                    {"type": "CLASS_MAX_HOURS_DAILY", "weight": 100, "active": True,
                     "params": {"class": c, "maxHours": mh}})

        def f_class_not_first():
            c = random.choice(classes)
            return (f"{c} ilk derse girmesin",
                    {"type": "CLASS_NOT_FIRST_HOUR", "weight": 100, "active": True,
                     "params": {"class": c}})

        factories = [f_teacher_day, f_teacher_maxh, f_teacher_maxdays, f_teacher_not_last,
                     f_subj_not_day, f_subj_pref_hours, f_subj_last, f_subj_room,
                     f_class_maxh, f_class_not_first]
        k = random.randint(2, 5)
        chosen = random.sample(factories, k)
        parts, constraints = [], []
        for fac in chosen:
            phrase, c = fac()
            parts.append(phrase)
            constraints.append(c)
        request = parts[0]
        for p in parts[1:]:
            request += random.choice([", ", " ve ", "; ", ". Ayrıca "]) + p
        payload = {
            "constraints": constraints,
            "confidence": round(random.uniform(0.80, 0.92), 2),
            "explanation": f"{len(constraints)} kısıtlama eklendi: " + ", ".join(c["type"] for c in constraints) + ".",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_ambiguous(n: int) -> list[dict]:
    out = []
    for i in range(n):
        kind = i % 4
        if kind == 0:

            full = random.choice(TEACHERS)
            same_first = first_name(full)
            _surnames = [t.split()[-1] for t in TEACHERS if t.split()[-1] != full.split()[-1]]
            other = f"{same_first} {random.choice(_surnames)}"
            ctx = make_context()
            ctx["teachers"] = list(set(ctx["teachers"] + [full, other]))
            day = random.choice(ctx["days"])
            request = f"{same_first} hoca {day_phrase(day)} günü yok"
            payload = {
                "constraints": [],
                "confidence": 0.35,
                "explanation": f"'{same_first}' adında birden fazla öğretmen mevcut: {full}, {other}. Lütfen hangisini kastettiğinizi belirtin.",
                "warnings": [],
                "unresolved": [f"'{same_first}' adı belirsiz — {full} mı, {other} mı?"],
            }
            out.append(example(ctx, request, payload))
        elif kind == 1:

            ctx = make_context()
            unknown = "Zühtü Pamukkale"
            day = random.choice(ctx["days"])
            request = f"{unknown} hoca {day_phrase(day)} günü olmasın"
            payload = {
                "constraints": [],
                "confidence": 0.30,
                "explanation": f"'{unknown}' adında bir öğretmen bulamadım. Lütfen öğretmen ekleyin veya adı kontrol edin.",
                "warnings": [],
                "unresolved": [f"'{unknown}' adlı öğretmen sistemde yok"],
            }
            out.append(example(ctx, request, payload))
        elif kind == 2:

            ctx = make_context()
            request = random.choice([
                "kanka şu programa bişeyler yap ya",
                "olm bişey yapsana",
                "asdf qwerty",
                "şey işte malum",
            ])
            payload = {
                "constraints": [],
                "confidence": 0.15,
                "explanation": "Talebinizi anlayamadım. Lütfen daha açık yazın. Örnek: 'Ahmet hoca cuma 2. derste olmasın'",
                "warnings": ["Talep anlaşılamadı"],
                "unresolved": [],
            }
            out.append(example(ctx, request, payload))
        else:

            teacher = random.choice(TEACHERS)
            ctx = make_context(extra_teachers=[teacher])
            request = f"{first_name(teacher)} hoca erken çıkmalı"
            payload = {
                "constraints": [],
                "confidence": 0.40,
                "explanation": f"'{first_name(teacher)} hoca erken çıkmalı' talebi net değil. Hangi günler ve saatler için olduğunu belirtir misiniz?",
                "warnings": ["'erken çıkmalı' net değil — gün ve saat belirtilmedi"],
                "unresolved": [],
            }
            out.append(example(ctx, request, payload))
    return out

def _typo(word: str) -> str:
    """Basit yazım hatası üret (harf çiftleme / yer değiştirme / düşürme)."""
    if len(word) < 4:
        return word + word[-1]
    i = random.randint(1, len(word) - 2)
    mode = random.choice(["double", "swap", "drop"])
    if mode == "double":
        return word[:i] + word[i] + word[i:]
    if mode == "swap":
        return word[:i] + word[i + 1] + word[i] + word[i + 2:]
    return word[:i] + word[i + 1:]


def gen_edge_cases(n: int) -> list[dict]:
    """Gerçekçi zor kenar durumlar: yazım hatası, çelişki, imkânsız kısıt, kısmi-geçersiz.

    Eski 'ambiguous' generatörü sadece dar belirsizlikleri kapsıyordu. Bu generatör
    production'da sık görülen 4 senaryoyu öğretir:
    - typo: ada yakın yazım hatası → en yakın gerçek ada düzelt + uyarı
    - contradiction: 'en az X ama en fazla Y' (X>Y) → netleştirme sorusu
    - infeasible: aşırı kısıtlayıcı istek → uygula ama güçlü uyar
    - partial: biri context'te biri olmayan iki referans → geçerliyi üret, diğerini unresolved
    """
    out = []
    for i in range(n):
        kind = i % 4
        if kind == 0:
            teacher = random.choice(TEACHERS)
            ctx = make_context(extra_teachers=[teacher])
            D, H = ctx["days"], ctx["hoursPerDay"]
            day = random.choice(D)
            typo = _typo(first_name(teacher))
            request = f"{typo} hoca {day_phrase(day)} günü yok"
            slots = [{"day": day, "hour": h} for h in range(1, H + 1)]
            payload = {
                "constraints": [{
                    "type": "TEACHER_NOT_AVAILABLE", "weight": 100, "active": True,
                    "params": {"teacher": teacher, "slots": slots},
                }],
                "confidence": 0.72,
                "explanation": f"'{typo}' muhtemelen '{teacher}' öğretmeni — ona göre kısıtlama eklendi.",
                "warnings": [f"'{typo}' tam eşleşmedi; '{teacher}' varsayıldı. Yanlışsa düzeltin."],
                "unresolved": [],
            }
            out.append(example(ctx, request, payload))
        elif kind == 1:
            teacher = random.choice(TEACHERS)
            ctx = make_context(extra_teachers=[teacher])
            lo = random.randint(5, 7)
            hi = random.randint(2, 4)
            request = f"{first_name(teacher)} günde en az {lo} ders versin ama en fazla {hi} ders versin"
            payload = {
                "kind": "query",
                "answer": f"Bu istek çelişkili: {first_name(teacher)} için günde 'en az {lo}' ile 'en fazla {hi}' aynı anda olamaz ({lo} > {hi}). Hangisi geçerli olsun?",
                "data": [{"option": f"Günde en az {lo} ders"}, {"option": f"Günde en fazla {hi} ders"}],
                "needsClarification": True,
                "confidence": 0.3,
            }
            out.append(example(ctx, request, payload))
        elif kind == 2:
            ctx = make_context()
            if random.random() < 0.5:
                request = "Tüm öğretmenler haftada en fazla 1 gün gelsin"
                c = {"type": "ALL_TEACHERS_MAX_DAYS_PER_WEEK", "weight": 100, "active": True, "params": {"maxDays": 1}}
            else:
                request = "Bütün sınıflar günde en fazla 1 ders alsın"
                c = {"type": "STUDENTS_MAX_HOURS_DAILY", "weight": 100, "active": True, "params": {"maxHours": 1}}
            payload = {
                "constraints": [c],
                "confidence": 0.55,
                "explanation": "Kısıtlama eklendi, ancak çok kısıtlayıcı.",
                "warnings": ["Bu kısıtlama programı ÇÖZÜLEMEZ hale getirebilir — gerçekten istiyor musunuz?"],
                "unresolved": [],
            }
            out.append(example(ctx, request, payload))
        else:
            known = random.choice(TEACHERS)
            ctx = make_context(extra_teachers=[known])
            unknown = random.choice(["Zühtü Pamukkale", "Nurettin Aladağ", "Cevahir Tekin", "Müjgan Soysal"])
            while first_name(unknown) == first_name(known):
                unknown = random.choice(["Zühtü Pamukkale", "Nurettin Aladağ", "Cevahir Tekin", "Müjgan Soysal"])
            ctx["teachers"] = [t for t in ctx["teachers"] if first_name(t) != first_name(unknown)]
            D, H = ctx["days"], ctx["hoursPerDay"]
            d1, d2 = random.sample(D, 2)
            request = f"{first_name(known)} {day_phrase(d1)} yok, {first_name(unknown)} {day_phrase(d2)} yok"
            slots = [{"day": d1, "hour": h} for h in range(1, H + 1)]
            payload = {
                "constraints": [{
                    "type": "TEACHER_NOT_AVAILABLE", "weight": 100, "active": True,
                    "params": {"teacher": known, "slots": slots},
                }],
                "confidence": 0.6,
                "explanation": f"{known} için kısıtlama eklendi. '{first_name(unknown)}' sistemde bulunamadı, o kısıtlama eklenmedi.",
                "warnings": [],
                "unresolved": [f"'{first_name(unknown)}' adlı öğretmen CONTEXT'te yok — bu kısıtlama atlandı."],
            }
            out.append(example(ctx, request, payload))
    return out


def gen_teacher_min_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        min_h = random.randint(2, 5)
        templates = [
            f"{teacher_phrase(teacher)} günde en az {min_h} saat ders versin",
            f"{teacher_phrase(teacher)} her gün minimum {min_h} ders olsun",
            f"{teacher_phrase(teacher)} gün başına {min_h} dersten az olmasın",
            f"{teacher_phrase(teacher)} hocaya günde en az {min_h} saat verin",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MIN_HOURS_DAILY",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "minHours": min_h},
            }],
            "confidence": round(random.uniform(0.84, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin günde en az {min_h} saat ders vermesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_not_available_interval(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        start = random.randint(1, max(1, H - 1))
        end = random.randint(start + 1, H) if start < H else H
        templates = [
            f"{teacher_phrase(teacher)} {day_phrase(day)} {start}. ders ile {end}. ders arası müsait değil",
            f"{teacher_phrase(teacher)} {day_phrase(day)} {start} ile {end} saatler arası olmasın",
            f"{day_phrase(day)} günü {start}-{end} saatler arası {teacher_phrase(teacher)} müsait değil",
            f"{teacher_phrase(teacher)} {day_phrase(day)} {start}. ile {end}. ders arası izinli",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "TEACHER_NOT_AVAILABLE_INTERVAL",
                "weight": 100,
                "active": True,
                "params": {"teacher": teacher, "day": day, "startHour": start, "endHour": end},
            }],
            "confidence": round(random.uniform(0.85, 0.94), 2),
            "explanation": f"{teacher} öğretmeninin {day} günü {start}-{end} saatleri arası müsait olmaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_min_days_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        num_days = len(ctx["days"])
        min_d = random.randint(2, max(2, num_days - 1))
        templates = [
            f"{teacher_phrase(teacher)} haftada en az {min_d} gün okula gelsin",
            f"{teacher_phrase(teacher)} haftalık minimum {min_d} gün ders versin",
            f"{teacher_phrase(teacher)} haftada {min_d} günden az gelmesin",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "TEACHER_MIN_DAYS_PER_WEEK",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "minDays": min_d},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin haftada en az {min_d} gün okulda olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_hours_continuously(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        max_h = random.randint(2, 5)
        templates = [
            f"{teacher_phrase(teacher)} aralıksız en fazla {max_h} saat ders versin",
            f"{teacher_phrase(teacher)} {max_h} saatten fazla peş peşe ders vermesin",
            f"{teacher_phrase(teacher)} arka arkaya {max_h} saatten fazla olmasın",
            f"{teacher_phrase(teacher)} blok halinde max {max_h} ders",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_HOURS_CONTINUOUSLY",
                "weight": 90,
                "active": True,
                "params": {"teacher": teacher, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.83, 0.93), 2),
            "explanation": f"{teacher} öğretmeninin aralıksız en fazla {max_h} saat ders vermesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_building_changes_per_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        max_c = random.randint(0, 2)
        templates = [
            f"{teacher_phrase(teacher)} günde en fazla {max_c} kez bina değiştirsin",
            f"{teacher_phrase(teacher)} aynı gün {max_c} binadan fazla gezmesin",
            f"{teacher_phrase(teacher)} günlük max {max_c} bina değişimi",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_BUILDING_CHANGES_PER_DAY",
                "weight": 80,
                "active": True,
                "params": {"teacher": teacher, "maxChanges": max_c},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{teacher} öğretmeninin günde en fazla {max_c} kez bina değiştirmesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_max_building_changes_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        max_c = random.randint(1, 5)
        templates = [
            f"{teacher_phrase(teacher)} haftada en fazla {max_c} kez bina değiştirsin",
            f"{teacher_phrase(teacher)} hafta boyu {max_c} binadan fazla gezmesin",
            f"{teacher_phrase(teacher)} haftalık max {max_c} bina değişimi",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MAX_BUILDING_CHANGES_PER_WEEK",
                "weight": 80,
                "active": True,
                "params": {"teacher": teacher, "maxChanges": max_c},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{teacher} öğretmeninin haftada en fazla {max_c} kez bina değiştirmesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_min_gaps_between_building_changes(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        min_g = random.randint(1, 3)
        templates = [
            f"{teacher_phrase(teacher)} bina değiştirirken arada en az {min_g} boş ders olsun",
            f"{teacher_phrase(teacher)} bina geçişleri arası min {min_g} boşluk",
            f"{teacher_phrase(teacher)} farklı binalar arası {min_g} ders mola olsun",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES",
                "weight": 80,
                "active": True,
                "params": {"teacher": teacher, "minGaps": min_g},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{teacher} öğretmeninin bina değişiklikleri arası en az {min_g} boş ders olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_not_first_hour(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        templates = [
            f"{teacher_phrase(teacher)} ilk derse girmesin",
            f"{teacher_phrase(teacher)} sabah ilk saatte ders vermesin",
            f"{teacher_phrase(teacher)} 1. derste olmasın",
            f"{teacher_phrase(teacher)} günün ilk saatinde olmasın",
        ]
        request, _w = apply_strength(random.choice(templates), 95)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_NOT_FIRST_HOUR",
                "weight": _w,
                "active": True,
                "params": {"teacher": teacher},
            }],
            "confidence": round(random.uniform(0.86, 0.94), 2),
            "explanation": f"{teacher} öğretmeninin günün ilk saatinde ders vermemesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_not_last_hour(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        ctx = make_context(extra_teachers=[teacher])
        H = ctx["hoursPerDay"]
        templates = [
            f"{teacher_phrase(teacher)} son derse girmesin",
            f"{teacher_phrase(teacher)} günün son saatinde olmasın",
            f"{teacher_phrase(teacher)} {H}. derse koyma",
            f"{teacher_phrase(teacher)} son saatte ders vermesin",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "TEACHER_NOT_LAST_HOUR",
                "weight": 95,
                "active": True,
                "params": {"teacher": teacher},
            }],
            "confidence": round(random.uniform(0.86, 0.94), 2),
            "explanation": f"{teacher} öğretmeninin günün son saatinde ders vermemesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_min_rest_between_days(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        rest = random.randint(2, 4)
        templates = [
            f"{teacher_phrase(teacher)} günler arası en az {rest} saat dinlensin",
            f"{teacher_phrase(teacher)} iki gün arası {rest} saat ara olsun",
            f"{teacher_phrase(teacher)} arka arkaya yorulmasın {rest} saat boşluk",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        payload = {
            "constraints": [{
                "type": "TEACHER_MIN_REST_BETWEEN_DAYS",
                "weight": 70,
                "active": True,
                "params": {"teacher": teacher, "minRestHours": rest},
            }],
            "confidence": round(random.uniform(0.78, 0.88), 2),
            "explanation": f"{teacher} öğretmeninin günler arası en az {rest} saat dinlenmesi tercih ediliyor.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_max_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        max_h = random.randint(5, 8)
        templates = [
            f"{cls} sınıfı günde en fazla {max_h} ders alsın",
            f"{cls} günlük {max_h} dersten fazla olmasın",
            f"{cls} sınıfına günde {max_h} saatten fazla koyma",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MAX_HOURS_DAILY",
                "weight": 100,
                "active": True,
                "params": {"class": cls, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.87, 0.95), 2),
            "explanation": f"{cls} sınıfının günde en fazla {max_h} ders alması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_min_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        min_h = random.randint(3, 5)
        templates = [
            f"{cls} sınıfı günde en az {min_h} ders alsın",
            f"{cls} günlük minimum {min_h} ders olsun",
            f"{cls} sınıfına günde {min_h} saatten az koyma",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MIN_HOURS_DAILY",
                "weight": 90,
                "active": True,
                "params": {"class": cls, "minHours": min_h},
            }],
            "confidence": round(random.uniform(0.85, 0.94), 2),
            "explanation": f"{cls} sınıfının günde en az {min_h} ders alması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_max_gaps_per_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        gaps = random.randint(0, 2)
        templates = [
            f"{cls} sınıfı günde en fazla {gaps} boş ders olsun",
            f"{cls} günde {gaps} boşluktan fazla olmasın",
            f"{cls} sınıfı günlük programında {gaps} boş saatten fazla olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MAX_GAPS_PER_DAY",
                "weight": 90,
                "active": True,
                "params": {"class": cls, "maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.85, 0.94), 2),
            "explanation": f"{cls} sınıfının günde en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_early_max_beginnings(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        max_b = random.randint(0, 2)
        templates = [
            f"{cls} sınıfı haftada en fazla {max_b} kez 2. saatte başlasın",
            f"{cls} sınıfının ilk dersi {max_b} günden fazla boş kalmasın",
            f"{cls} haftada {max_b} günden fazla geç başlamasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_EARLY_MAX_BEGINNINGS",
                "weight": 80,
                "active": True,
                "params": {"class": cls, "maxBeginnings": max_b},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{cls} sınıfının haftada en fazla {max_b} kez 2. saatte başlaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_max_building_changes_per_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        max_c = random.randint(0, 2)
        templates = [
            f"{cls} sınıfı günde en fazla {max_c} kez bina değiştirsin",
            f"{cls} öğrencileri aynı gün {max_c} binadan fazla gezmesin",
            f"{cls} sınıfı günlük max {max_c} bina değişimi",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MAX_BUILDING_CHANGES_PER_DAY",
                "weight": 80,
                "active": True,
                "params": {"class": cls, "maxChanges": max_c},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{cls} sınıfının günde en fazla {max_c} kez bina değiştirmesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_min_gaps_between_building_changes(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        min_g = random.randint(1, 3)
        templates = [
            f"{cls} sınıfı bina değiştirirken arada en az {min_g} boş ders olsun",
            f"{cls} öğrencileri bina geçişi arası {min_g} ders dinlensin",
            f"{cls} sınıfı farklı binalar arası {min_g} ders mola olsun",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES",
                "weight": 80,
                "active": True,
                "params": {"class": cls, "minGaps": min_g},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{cls} sınıfının bina değişiklikleri arası en az {min_g} boş ders olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_not_first_hour(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        templates = [
            f"{cls} sınıfı ilk derste ders almasın",
            f"{cls} 1. derste olmasın",
            f"{cls} sınıfı günün ilk saatinde boş olsun",
            f"{cls} sabah ilk derste ders olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_NOT_FIRST_HOUR",
                "weight": 100,
                "active": True,
                "params": {"class": cls},
            }],
            "confidence": round(random.uniform(0.87, 0.94), 2),
            "explanation": f"{cls} sınıfının ilk saatte ders almaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_class_max_hours_continuously(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        max_h = random.randint(3, 5)
        templates = [
            f"{cls} sınıfı aralıksız en fazla {max_h} ders alsın",
            f"{cls} öğrencileri arka arkaya {max_h} saatten fazla ders almasın",
            f"{cls} sınıfı blok halinde max {max_h} saat olsun",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        payload = {
            "constraints": [{
                "type": "CLASS_MAX_HOURS_CONTINUOUSLY",
                "weight": 80,
                "active": True,
                "params": {"class": cls, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.82, 0.92), 2),
            "explanation": f"{cls} sınıfının aralıksız en fazla {max_h} ders alması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activity_fixed_time(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        aid = random.randint(1, 50)
        ctx = make_context()
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        hour = random.randint(1, H)
        templates = [
            f"{aid} numaralı aktivite {day_phrase(day)} {hour}. derse sabitlensin",
            f"{aid} numaralı ders {day_phrase(day)} {hour}. saatte olsun",
            f"Aktivite #{aid} {day_phrase(day)} {hour}. derste yapılsın",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "ACTIVITY_FIXED_TIME",
                "weight": 100,
                "active": True,
                "params": {"activityId": aid, "day": day, "hour": hour},
            }],
            "confidence": round(random.uniform(0.86, 0.94), 2),
            "explanation": f"Aktivite #{aid} {day} günü {hour}. saatte sabitlendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activities_same_starting_time(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri aynı saatte başlasın",
            f"Aktivite {ids_str} aynı anda başlasın",
            f"{ids_str} numaralı aktiviteler aynı saatte yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ACTIVITIES_SAME_STARTING_TIME",
                "weight": 90,
                "active": True,
                "params": {"activityIds": ids},
            }],
            "confidence": round(random.uniform(0.83, 0.92), 2),
            "explanation": f"{ids_str} numaralı aktivitelerin aynı saatte başlaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activities_not_overlapping(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri çakışmasın",
            f"Aktivite {ids_str} aynı saatte olmasın",
            f"{ids_str} aktiviteleri farklı zamanlarda yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ACTIVITIES_NOT_OVERLAPPING",
                "weight": 100,
                "active": True,
                "params": {"activityIds": ids},
            }],
            "confidence": round(random.uniform(0.84, 0.93), 2),
            "explanation": f"{ids_str} numaralı aktivitelerin çakışmaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activities_same_starting_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri aynı gün olsun",
            f"Aktivite {ids_str} aynı günde yapılsın",
            f"{ids_str} numaralı aktiviteler aynı gün başlasın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ACTIVITIES_SAME_STARTING_DAY",
                "weight": 80,
                "active": True,
                "params": {"activityIds": ids},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{ids_str} numaralı aktivitelerin aynı gün yapılması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activity_ends_students_day(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        aid = random.randint(1, 50)
        templates = [
            f"#{aid} aktivitesi günün son dersinde olsun",
            f"Aktivite {aid} öğrenci gününün sonunda yapılsın",
            f"#{aid} numaralı aktivite son saatte olsun",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ACTIVITY_ENDS_STUDENTS_DAY",
                "weight": 90,
                "active": True,
                "params": {"activityId": aid},
            }],
            "confidence": round(random.uniform(0.84, 0.93), 2),
            "explanation": f"Aktivite #{aid} öğrenci gününün sonunda olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_not_first_hour(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        cls = random.choice(CLASSES) if random.random() < 0.4 else None
        if cls:
            templates = [
                f"{subj} dersi {cls} sınıfında ilk derste olmasın",
                f"{cls} için {subj} ilk saatte yapılmasın",
            ]
        else:
            templates = [
                f"{subj} dersi ilk derste olmasın",
                f"{subj} sabah ilk saatte işlenmesin",
                f"{subj} 1. derse koyma",
            ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls] if cls else None)
        payload = {
            "constraints": [{
                "type": "SUBJECT_NOT_FIRST_HOUR",
                "weight": 90,
                "active": True,
                "params": {"subject": subj, "class": cls},
            }],
            "confidence": round(random.uniform(0.83, 0.92), 2),
            "explanation": f"{subj} dersinin{(' ' + cls + ' sınıfı için') if cls else ''} ilk saatte işlenmemesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_min_days_between_activities_custom(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        min_d = random.randint(1, 3)
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri arasında en az {min_d} gün olsun",
            f"Aktivite {ids_str} arası minimum {min_d} gün boşluk",
            f"{ids_str} aktiviteleri {min_d} gün arayla yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM",
                "weight": 90,
                "active": True,
                "params": {"activityIds": ids, "minDays": min_d},
            }],
            "confidence": round(random.uniform(0.83, 0.92), 2),
            "explanation": f"{ids_str} aktiviteleri arasında en az {min_d} gün olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_min_gaps_between_activities(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        min_g = random.randint(1, 3)
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri arasında en az {min_g} boş ders olsun",
            f"Aktivite {ids_str} arası min {min_g} boşluk",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "MIN_GAPS_BETWEEN_ACTIVITIES",
                "weight": 80,
                "active": True,
                "params": {"activityIds": ids, "minGaps": min_g},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{ids_str} aktiviteleri arası en az {min_g} boş ders kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_max_gaps_between_activities(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 4)))
        max_g = random.randint(1, 4)
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri arasında en fazla {max_g} boş ders olsun",
            f"Aktivite {ids_str} arası max {max_g} boşluk",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "MAX_GAPS_BETWEEN_ACTIVITIES",
                "weight": 80,
                "active": True,
                "params": {"activityIds": ids, "maxGaps": max_g},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{ids_str} aktiviteleri arası en fazla {max_g} boş ders kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activity_preferred_starting_times(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        aid = random.randint(1, 50)
        ctx = make_context()
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        hours = sorted(random.sample(range(1, H + 1), random.randint(1, min(3, H))))
        slots = [{"day": day, "hour": h} for h in hours]
        hours_str = ", ".join(str(h) for h in hours)
        templates = [
            f"#{aid} aktivitesi tercihen {day_phrase(day)} {hours_str}. derslerde olsun",
            f"Aktivite {aid} {day_phrase(day)} {hours_str}. saatlerde başlasın",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "ACTIVITY_PREFERRED_STARTING_TIMES",
                "weight": 80,
                "active": True,
                "params": {"activityId": aid, "slots": slots},
            }],
            "confidence": round(random.uniform(0.80, 0.91), 2),
            "explanation": f"Aktivite #{aid} için tercih edilen başlangıç saatleri ayarlandı.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_preferred_rooms(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        rooms = random.sample(ROOMS, random.randint(2, 4))
        rooms_str = ", ".join(rooms)
        templates = [
            f"{subj} dersleri {rooms_str} dersliklerinden birinde yapılsın",
            f"{subj} için tercih edilen derslikler: {rooms_str}",
            f"{subj} {rooms_str} dersliklerinden birinde olsun",
        ]
        request = random.choice(templates)
        ctx = make_context()
        for r in rooms:
            if r not in ctx["rooms"]:
                ctx["rooms"].append(r)
        payload = {
            "constraints": [{
                "type": "SUBJECT_PREFERRED_ROOMS",
                "weight": 90,
                "active": True,
                "params": {"subject": subj, "rooms": rooms},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{subj} derslerinin {rooms_str} dersliklerinden birinde yapılması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_preferred_room(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        room = random.choice(ROOMS)
        templates = [
            f"{teacher_phrase(teacher)} tercihen {room} dersliğinde olsun",
            f"{teacher_phrase(teacher)} {room}'da ders vermeyi tercih eder",
            f"{teacher_phrase(teacher)} mümkünse {room}'da",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = {
            "constraints": [{
                "type": "TEACHER_PREFERRED_ROOM",
                "weight": 80,
                "active": True,
                "params": {"teacher": teacher, "room": room},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{teacher} öğretmeninin {room} dersliğini tercih etmesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_teacher_preferred_rooms(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        rooms = random.sample(ROOMS, random.randint(2, 4))
        rooms_str = ", ".join(rooms)
        templates = [
            f"{teacher_phrase(teacher)} {rooms_str} dersliklerinden birinde olsun",
            f"{teacher_phrase(teacher)} tercih edilen derslikler: {rooms_str}",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_teachers=[teacher])
        for r in rooms:
            if r not in ctx["rooms"]:
                ctx["rooms"].append(r)
        payload = {
            "constraints": [{
                "type": "TEACHER_PREFERRED_ROOMS",
                "weight": 80,
                "active": True,
                "params": {"teacher": teacher, "rooms": rooms},
            }],
            "confidence": round(random.uniform(0.82, 0.91), 2),
            "explanation": f"{teacher} öğretmeninin {rooms_str} dersliklerini tercih etmesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activity_preferred_room(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        aid = random.randint(1, 50)
        room = random.choice(ROOMS)
        templates = [
            f"#{aid} aktivitesi {room} dersliğinde olsun",
            f"Aktivite {aid} tercihen {room}'da yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = {
            "constraints": [{
                "type": "ACTIVITY_PREFERRED_ROOM",
                "weight": 90,
                "active": True,
                "params": {"activityId": aid, "room": room},
            }],
            "confidence": round(random.uniform(0.84, 0.92), 2),
            "explanation": f"Aktivite #{aid} için tercih edilen derslik {room} olarak ayarlandı.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activity_preferred_rooms(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        aid = random.randint(1, 50)
        rooms = random.sample(ROOMS, random.randint(2, 4))
        rooms_str = ", ".join(rooms)
        templates = [
            f"#{aid} aktivitesi {rooms_str} dersliklerinden birinde olsun",
            f"Aktivite {aid} tercih edilen derslikler: {rooms_str}",
        ]
        request = random.choice(templates)
        ctx = make_context()
        for r in rooms:
            if r not in ctx["rooms"]:
                ctx["rooms"].append(r)
        payload = {
            "constraints": [{
                "type": "ACTIVITY_PREFERRED_ROOMS",
                "weight": 85,
                "active": True,
                "params": {"activityId": aid, "rooms": rooms},
            }],
            "confidence": round(random.uniform(0.83, 0.92), 2),
            "explanation": f"Aktivite #{aid} için tercih edilen derslikler ayarlandı.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_activity_tag_preferred_room(n: int) -> list[dict]:
    out = []
    tags = ["Lab", "Teori", "Pratik", "Atölye", "Test"]
    for _ in range(n):
        subj = random.choice(SUBJECTS)
        tag = random.choice(tags)
        room = random.choice(ROOMS)
        templates = [
            f"{subj} dersi {tag} etiketli aktivitelerde {room}'da olsun",
            f"{subj} - {tag} için derslik {room}",
            f"{tag} etiketli {subj} dersleri {room} dersliğinde yapılsın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = {
            "constraints": [{
                "type": "SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM",
                "weight": 85,
                "active": True,
                "params": {"subject": subj, "activityTag": tag, "room": room},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{subj} dersinin '{tag}' etiketli aktivitelerinin {room} dersliğinde olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_activities_occupy_max_different_rooms(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 5)))
        max_r = random.randint(1, 3)
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri en fazla {max_r} farklı derslik kullansın",
            f"Aktivite {ids_str} {max_r} dersliği geçmesin",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS",
                "weight": 85,
                "active": True,
                "params": {"activityIds": ids, "maxDifferentRooms": max_r},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{ids_str} aktivitelerinin en fazla {max_r} farklı derslik kullanması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_students_set_home_rooms(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        rooms = random.sample([r for r in ROOMS if not any(k in r.lower() for k in ["lab", "atölye", "salon"])], min(3, random.randint(2, 3)))
        rooms_str = ", ".join(rooms)
        templates = [
            f"{cls} sınıfı ana derslikleri: {rooms_str}",
            f"{cls} sürekli {rooms_str} dersliklerinden birinde olsun",
            f"{cls} ana derslik listesi: {rooms_str}",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        for r in rooms:
            if r not in ctx["rooms"]:
                ctx["rooms"].append(r)
        payload = {
            "constraints": [{
                "type": "STUDENTS_SET_HOME_ROOMS",
                "weight": 90,
                "active": True,
                "params": {"class": cls, "rooms": rooms},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"{cls} sınıfının ana derslikleri {rooms_str} olarak ayarlandı.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_break_times(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ctx = make_context()
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        lo, hi = (3, max(3, H - 1)) if H >= 4 else (2, max(2, H - 1))
        hour = random.randint(lo, hi)
        slots = [{"day": day, "hour": hour}]
        templates = [
            f"{day_phrase(day)} {hour}. ders teneffüs olsun",
            f"{day_phrase(day)} {hour}. saatte ders konulmasın (mola)",
            f"{day_phrase(day)} {hour}. ders boş bırakılsın",
        ]
        request = random.choice(templates)
        payload = {
            "constraints": [{
                "type": "BREAK_TIMES",
                "weight": 100,
                "active": True,
                "params": {"slots": slots},
            }],
            "confidence": round(random.uniform(0.85, 0.94), 2),
            "explanation": f"{day} günü {hour}. saatin teneffüs olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_all_teachers_max_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        max_h = random.randint(5, 8)
        templates = [
            f"Tüm öğretmenler günde en fazla {max_h} saat ders versin",
            f"Bütün öğretmenlerin günlük max ders sayısı {max_h}",
            f"Her öğretmen günde {max_h} saatten fazla ders vermesin",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ALL_TEACHERS_MAX_HOURS_DAILY",
                "weight": 90,
                "active": True,
                "params": {"maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"Tüm öğretmenlerin günde en fazla {max_h} saat ders vermesi kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_all_teachers_max_days_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        max_d = random.randint(3, 5)
        templates = [
            f"Tüm öğretmenler haftada en fazla {max_d} gün okula gelsin",
            f"Bütün öğretmenlerin haftalık max gün sayısı {max_d}",
            f"Hiçbir öğretmen haftada {max_d} günden fazla okulda olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "ALL_TEACHERS_MAX_DAYS_PER_WEEK",
                "weight": 90,
                "active": True,
                "params": {"maxDays": max_d},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"Tüm öğretmenlerin haftada en fazla {max_d} gün okulda olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_students_max_gaps_per_week(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        gaps = random.randint(0, 3)
        templates = [
            f"Tüm sınıflar haftada en fazla {gaps} boş ders olsun",
            f"Bütün sınıfların haftalık max boşluk sayısı {gaps}",
            f"Hiçbir sınıfta haftada {gaps} boşluktan fazla olmasın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "STUDENTS_MAX_GAPS_PER_WEEK",
                "weight": 90,
                "active": True,
                "params": {"maxGaps": gaps},
            }],
            "confidence": round(random.uniform(0.85, 0.93), 2),
            "explanation": f"Tüm sınıfların haftada en fazla {gaps} boş saati olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_students_early_max_beginnings(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        max_b = random.randint(0, 2)
        templates = [
            f"Tüm sınıflar haftada en fazla {max_b} kez 2. saatte başlasın",
            f"Bütün sınıfların geç başlama sayısı {max_b}'ı geçmesin",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "STUDENTS_EARLY_MAX_BEGINNINGS",
                "weight": 80,
                "active": True,
                "params": {"maxBeginnings": max_b},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"Tüm sınıfların haftada en fazla {max_b} kez 2. saatte başlaması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_students_max_hours_daily(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        max_h = random.randint(5, 8)
        templates = [
            f"Tüm sınıflar günde en fazla {max_h} ders alsın",
            f"Bütün sınıfların günlük max ders sayısı {max_h}",
            f"Hiçbir sınıf günde {max_h} dersten fazla almasın",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "STUDENTS_MAX_HOURS_DAILY",
                "weight": 100,
                "active": True,
                "params": {"maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.86, 0.94), 2),
            "explanation": f"Tüm sınıfların günde en fazla {max_h} ders alması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_max_total_activities_from_set(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ids = sorted(random.sample(range(1, 80), random.randint(2, 5)))
        max_h = random.randint(1, 3)
        ids_str = ", ".join(str(i) for i in ids)
        templates = [
            f"{ids_str} aktiviteleri toplam günlük {max_h} saatten fazla olmasın",
            f"Aktivite grubu {ids_str} günde en fazla {max_h} saat olsun",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "constraints": [{
                "type": "MAX_TOTAL_ACTIVITIES_FROM_SET",
                "weight": 85,
                "active": True,
                "params": {"activityIds": ids, "maxHours": max_h},
            }],
            "confidence": round(random.uniform(0.80, 0.90), 2),
            "explanation": f"{ids_str} aktivitelerinin toplam günlük en fazla {max_h} saat olması kısıtlaması eklendi.",
            "warnings": [],
            "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_data_mutations(n: int) -> list[dict]:
    """
    AI üzerinden CRUD işlem örnekleri — kind:"data_mutation".

    Çeşitlilik:
      - add_subject / delete_subject
      - add_teacher (+ optional link_teacher_subject)
      - add_class (+ optional year)
      - add_room (kapasite ile)
      - add_day / delete_day
      - add_activity (çoklu: subject + link + activity)
      - delete_teacher / delete_room / delete_class (destructive — explanation onay metni)
      - link_teacher_subject / unlink_teacher_subject
      - Multi-step rehber → query (data_mutation değil, ama dataset bütünlüğü için 10% pay)
    """
    out: list[dict] = []
    OPS_BASIC = [
        "add_subject", "add_teacher", "add_class", "add_room", "add_day",
        "delete_subject", "delete_teacher", "delete_class", "delete_room", "delete_day",
        "link_teacher_subject", "unlink_teacher_subject",
        "add_activity_combo", "update_teacher_hours", "wizard",
    ]

    for i in range(n):
        op = OPS_BASIC[i % len(OPS_BASIC)]
        ctx = make_context()

        if op == "add_subject":
            subj = random.choice(SUBJECTS)
            request = random.choice([
                f"{subj} branşını ekle",
                f"{subj} dersini ekle",
                f"'{subj}' adında yeni branş oluştur",
                f"Yeni ders: {subj}, ekle",
                f"Okul müfredatına {subj} ekleyelim",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "add_subject",
                    "params": {"name": subj},
                    "description": f"\"{subj}\" branşını ekle",
                }],
                "explanation": f"\"{subj}\" branşı eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.85, 0.95), 2),
            }

        elif op == "add_teacher":
            teacher = random.choice(TEACHERS)
            subj = random.choice(SUBJECTS)
            include_subject = random.random() < 0.6
            if include_subject:
                request = random.choice([
                    f"{teacher} adında {subj} öğretmeni ekle",
                    f"Yeni öğretmen: {teacher}, branşı {subj}",
                    f"{teacher} hocasını ekle, {subj} branşı için",
                ])
                actions = [
                    {"op": "add_teacher", "params": {"name": teacher},
                     "description": f"\"{teacher}\" öğretmenini ekle"},
                    {"op": "link_teacher_subject",
                     "params": {"teacher": teacher, "subject": subj},
                     "description": f"{teacher} → \"{subj}\" yeterliliği"},
                ]
                explanation = f"\"{teacher}\" öğretmeni ve \"{subj}\" yeterliliği eklenecek."
            else:
                request = random.choice([
                    f"{teacher} adında öğretmen ekle",
                    f"{teacher} hocayı ekle",
                    f"Yeni öğretmen: {teacher}",
                ])
                actions = [{
                    "op": "add_teacher", "params": {"name": teacher},
                    "description": f"\"{teacher}\" öğretmenini ekle",
                }]
                explanation = f"\"{teacher}\" öğretmeni eklenecek."
            payload = {
                "kind": "data_mutation",
                "actions": actions,
                "explanation": explanation,
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.83, 0.94), 2),
            }

        elif op == "add_class":
            cls = random.choice(CLASSES)
            grade = cls[:2] if cls[:2].isdigit() else cls[:1]
            year_name = f"{grade}. Sınıf"
            request = random.choice([
                f"{cls} sınıfını ekle",
                f"{cls} sınıfı oluştur, {year_name} kademesine",
                f"{cls} adında yeni sınıf ekle",
                f"Yeni sınıf: {cls}",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "add_class",
                    "params": {"name": cls, "year": year_name},
                    "description": f"{cls} sınıfını ekle ({year_name})",
                }],
                "explanation": f"{cls} sınıfı {year_name} kademesinde eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.85, 0.94), 2),
            }

        elif op == "add_room":
            room = random.choice(ROOMS)
            cap = random.choice([20, 25, 28, 30, 32, 36, 40])
            request = random.choice([
                f"{room} dersliği ekle, kapasite {cap}",
                f"Yeni derslik: {room}, {cap} kişilik",
                f"'{room}' adında derslik oluştur kapasite {cap}",
                f"{room} adında oda ekle ({cap} öğrenci)",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "add_room",
                    "params": {"name": room, "capacity": cap},
                    "description": f"\"{room}\" dersliği ekle (kapasite {cap})",
                }],
                "explanation": f"\"{room}\" adlı derslik {cap} kapasiteyle eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.85, 0.94), 2),
            }

        elif op == "add_day":
            day = random.choice(["Cumartesi", "Pazar"])
            request = random.choice([
                f"{day} gününü programa ekle",
                f"{day} günü de ekle",
                f"{day} gününü aç",
                f"Hafta sonu {day} ekleyelim",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "add_day",
                    "params": {"name": day},
                    "description": f"\"{day}\" gününü programa ekle",
                }],
                "explanation": f"\"{day}\" günü programa eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        elif op == "delete_subject":
            subj = random.choice(SUBJECTS)
            request = random.choice([
                f"{subj} branşını sil",
                f"{subj} dersini kaldır",
                f"{subj}'i sil",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "delete_subject",
                    "params": {"name": subj},
                    "description": f"\"{subj}\" branşını sil",
                }],
                "explanation": f"\"{subj}\" branşını silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.78, 0.88), 2),
            }

        elif op == "delete_teacher":
            teacher = random.choice(TEACHERS)
            request = random.choice([
                f"{teacher} öğretmenini sil",
                f"{teacher} hocasını kaldır",
                f"{teacher}'i sil",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "delete_teacher",
                    "params": {"name": teacher},
                    "description": f"{teacher} öğretmenini sil",
                }],
                "explanation": f"{teacher} öğretmenini ve atandığı tüm dersleri silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.75, 0.88), 2),
            }

        elif op == "delete_class":
            cls = random.choice(CLASSES)
            request = random.choice([
                f"{cls} sınıfını sil",
                f"{cls} sınıfı kaldır",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "delete_class",
                    "params": {"name": cls},
                    "description": f"{cls} sınıfını sil",
                }],
                "explanation": f"{cls} sınıfını silmek üzeresiniz. Bu sınıfa bağlı tüm dersler de silinecektir. Onaylıyor musunuz?",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.78, 0.88), 2),
            }

        elif op == "delete_room":
            room = random.choice(ROOMS)
            request = random.choice([
                f"{room} dersliğini sil",
                f"{room} odasını kaldır",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "delete_room",
                    "params": {"name": room},
                    "description": f"\"{room}\" dersliğini sil",
                }],
                "explanation": f"\"{room}\" dersliğini silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.78, 0.88), 2),
            }

        elif op == "delete_day":
            day = random.choice(ctx["days"])
            request = random.choice([
                f"{day} gününü programdan kaldır",
                f"{day} gününü sil",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "delete_day",
                    "params": {"name": day},
                    "description": f"\"{day}\" gününü programdan kaldır",
                }],
                "explanation": f"\"{day}\" günü programdan kaldırılacak. Bu işlem geri alınamaz.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.80, 0.88), 2),
            }

        elif op == "link_teacher_subject":
            teacher = random.choice(TEACHERS)
            subj = random.choice(SUBJECTS)
            request = random.choice([
                f"{teacher} öğretmenine {subj} branşı ata",
                f"{teacher} hocaya {subj} yeterliliği ekle",
                f"{teacher}'in branşına {subj} ekle",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "link_teacher_subject",
                    "params": {"teacher": teacher, "subject": subj},
                    "description": f"{teacher} → \"{subj}\" yeterliliği",
                }],
                "explanation": f"{teacher} öğretmenine \"{subj}\" yeterliliği eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.85, 0.94), 2),
            }

        elif op == "unlink_teacher_subject":
            teacher = random.choice(TEACHERS)
            subj = random.choice(SUBJECTS)
            request = random.choice([
                f"{teacher} öğretmeninden {subj} yeterliliğini kaldır",
                f"{teacher}'in {subj} branşını sil",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "unlink_teacher_subject",
                    "params": {"teacher": teacher, "subject": subj},
                    "description": f"{teacher} → \"{subj}\" yeterliliği kaldır",
                }],
                "explanation": f"{teacher} öğretmeninden \"{subj}\" yeterliliği kaldırılacak.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.83, 0.92), 2),
            }

        elif op == "add_activity_combo":
            teacher = random.choice(TEACHERS)
            cls = random.choice(CLASSES)
            subj = random.choice(SUBJECTS)
            hours = random.randint(1, 5)
            request = random.choice([
                f"{teacher} hocaya {cls}'ye {hours} saat {subj} dersi ekle",
                f"{cls} sınıfına {hours} saat {subj} ders koy, öğretmen {teacher}",
                f"{teacher} öğretmenini {cls}'de {subj} dersine {hours} saat ata",
            ])
            actions = [
                {"op": "add_subject", "params": {"name": subj},
                 "description": f"\"{subj}\" branşını ekle (yoksa)"},
                {"op": "link_teacher_subject",
                 "params": {"teacher": teacher, "subject": subj},
                 "description": f"{teacher} → \"{subj}\" yeterliliği"},
                {"op": "add_activity", "params": {
                    "class": cls, "subject": subj, "teacher": teacher, "weeklyHours": hours,
                 },
                 "description": f"{cls} sınıfına {hours} saat \"{subj}\" ({teacher})"},
            ]
            payload = {
                "kind": "data_mutation",
                "actions": actions,
                "explanation": f"3 işlem önerildi: branş, yeterlilik, ders ataması.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.83, 0.92), 2),
            }

        elif op == "update_teacher_hours":
            teacher = random.choice(TEACHERS)
            hours = random.choice([20, 24, 30, 36, 40])
            request = random.choice([
                f"{teacher} öğretmeninin haftalık ders yükünü {hours} yap",
                f"{teacher}'in hedef saatini {hours} olarak güncelle",
            ])
            payload = {
                "kind": "data_mutation",
                "actions": [{
                    "op": "update_teacher",
                    "params": {"name": teacher, "weeklyTargetHours": hours},
                    "description": f"{teacher} → haftalık {hours} saat",
                }],
                "explanation": f"{teacher} öğretmeninin haftalık hedef saati {hours} olarak güncellenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.85, 0.93), 2),
            }

        else:  
            request = random.choice([
                "Ders programı oluşturalım, nereden başlayalım?",
                "Yeni bir okul kuruyorum, yardım eder misin?",
                "Sıfırdan ders programı yapacağız, rehberlik et",
                "Adım adım anlat, nereden başlayalım?",
            ])
            payload = {
                "kind": "query",
                "answer": (
                    "Ders programı için adım adım gidelim:\n"
                    "1) Gün/saat planı\n2) Branşlar\n3) Öğretmenler\n"
                    "4) Sınıflar\n5) Derslikler\n6) Ders dağıtımı\n"
                    "7) AI ile kısıtlamalar\n\n"
                    "Hangi adımdan başlamak istersiniz? Örnek: 'Matematik, Fizik branşlarını ekle' diyebilirsiniz."
                ),
                "confidence": 0.9,
            }

        out.append(example(ctx, request, payload))
    return out

def gen_conversational_wizard(n: int) -> list[dict]:
    """
    Conversational wizard örnekleri — gerçek konuşma akışı.

    Eski "Plans verilerinin tamamını liste olarak dök" davranışı yerine,
    her örnek BIR adımdır. Context'in mevcut doluluğuna göre AI tek soru
    sorar (1 soru + 1 örnek).

    Kategoriler (yaklaşık eşit dağılım):
      1. first_contact      — "yardım", "başla", "ders programı yapalım"
                              → context boş → "hangi dersler okutuluyor?"
      2. after_subjects     — subjects dolu, classes boş → "hangi sınıflar?"
      3. after_classes      — classes dolu, rooms boş → "hangi derslikler?"
      4. after_rooms        — rooms dolu, teachers boş → "öğretmenler?"
      5. after_teachers     — hepsi dolu, henüz aktivite yok → "ders dağıtımı?"
      6. after_activities   — hepsi tamam → "kısıtlama veya Programı Üret"

    Her örnek conversation history içerebilir (1-2 önceki mesaj) → AI bir
    sonraki adımı sorar. Format: kind='query' + answer KISA.
    """
    out: list[dict] = []
    KINDS = [
        "first_contact",
        "after_subjects",
        "after_classes",
        "after_rooms",
        "after_teachers",
        "after_activities",
    ]

    FIRST_PROMPTS = [
        "Ders programı oluşturalım",
        "Yardım et, ders programı yapacağım",
        "Yeni okul kurduk, nereden başlayalım?",
        "Sıfırdan başlayalım",
        "Birlikte ders programı yapalım",
        "Adım adım rehberlik et",
        "Bana yardım et lütfen",
        "Program oluşturalım, ne yapayım?",
        "Başlayalım",
        "Nasıl başlarız?",
    ]
    CONT_PROMPTS_GENERIC = [
        "tamam, sonra ne?",
        "devam edelim",
        "şimdi ne yapalım?",
        "peki sırada ne var?",
        "sonraki adım",
        "tamam",
        "ekledim",
        "oldu, başka?",
        "tamamladım, devam",
        "evet devam",
    ]

    def _short_subjects():
        return random.sample(SUBJECTS, random.randint(3, 6))

    def _short_classes():
        return random.sample(CLASSES, random.randint(3, 6))

    def _short_rooms():
        return random.sample(ROOMS, random.randint(3, 6))

    def _short_teachers():
        return random.sample(TEACHERS, random.randint(3, 8))

    for i in range(n):
        kind = KINDS[i % len(KINDS)]
        ctx = make_context()

        if kind == "first_contact":

            ctx["subjects"] = []
            ctx["classes"] = []
            ctx["rooms"] = []
            ctx["teachers"] = []
            request = random.choice(FIRST_PROMPTS)
            payload = {
                "kind": "query",
                "answer": random.choice([
                    "Tabii, birlikte yapalım. İlk olarak: okulunuzda hangi dersler okutuluyor? (Örnek: Matematik, Fizik, Türkçe, Tarih)",
                    "Başlayalım. İlk soru: hangi dersler okutuluyor? (Örnek: Matematik, Fizik, Türkçe)",
                    "Süper, adım adım gidelim. İlk olarak hangi dersler var okulunuzda? Virgülle ayırarak yazabilirsin. (Örnek: Matematik, Fizik, Türkçe, Tarih)",
                    "Hadi başlayalım. Okulunuzda hangi dersler okutuluyor? (Örnek: Matematik, Edebiyat, Fizik, Kimya)",
                ]),
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        elif kind == "after_subjects":
            subj_list = _short_subjects()
            ctx["subjects"] = subj_list
            ctx["classes"] = []
            ctx["rooms"] = []
            ctx["teachers"] = []
            request = random.choice(CONT_PROMPTS_GENERIC + [
                f"{', '.join(subj_list[:3])} ekledim",
                "dersleri ekledim, sırada ne var?",
                "tamam dersleri ekledim",
            ])
            ack = random.choice([
                f"Süper, {len(subj_list)} ders eklendi ({', '.join(subj_list[:3])}{'...' if len(subj_list) > 3 else ''}).",
                f"Harika, {len(subj_list)} ders hazır.",
                "Tamam, dersler kayıtlı.",
            ])
            step = random.choice([
                "Şimdi sınıflarınızı söyle (örn: 9A, 9B, 10F). Virgülle ayırabilirsin.",
                "Şimdi sınıflara geçelim. Hangi sınıflarınız var? (Örnek: 9A, 9B, 10F)",
                "Sıradaki adım sınıflar: kaç sınıfınız var ve adları neler? (Örnek: 9A, 9B, 10F)",
            ])
            payload = {
                "kind": "query",
                "answer": f"{ack} {step}",
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        elif kind == "after_classes":
            class_list = _short_classes()
            ctx["subjects"] = _short_subjects()
            ctx["classes"] = class_list
            ctx["rooms"] = []
            ctx["teachers"] = []
            request = random.choice(CONT_PROMPTS_GENERIC + [
                f"{', '.join(class_list[:3])} ekledim",
                "sınıfları ekledim, sırada ne?",
                "tamam sınıflar tamam",
            ])
            ack = random.choice([
                f"Harika, {len(class_list)} sınıf hazır ({', '.join(class_list[:3])}{'...' if len(class_list) > 3 else ''}).",
                "Tamam, sınıflar kayıtlı.",
                f"Süper, {len(class_list)} sınıf eklendi.",
            ])
            step = random.choice([
                "Hangi derslikleriniz var? (Örnek: 101, 102, Lab1, Salon)",
                "Şimdi derslikleri ekleyelim. Hangi odalar var? (Örnek: 101, 102, Lab1)",
                "Sıradaki adım: derslikler. Hangi sınıflar/odalar mevcut? (Örnek: 101, Lab1, Salon)",
            ])
            payload = {
                "kind": "query",
                "answer": f"{ack} {step}",
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        elif kind == "after_rooms":
            room_list = _short_rooms()
            ctx["subjects"] = _short_subjects()
            ctx["classes"] = _short_classes()
            ctx["rooms"] = room_list
            ctx["teachers"] = []
            request = random.choice(CONT_PROMPTS_GENERIC + [
                f"{', '.join(room_list[:3])} ekledim",
                "derslikleri ekledim",
                "tamam derslikler tamam",
            ])
            ack = random.choice([
                f"Tamam, {len(room_list)} derslik kayıtlı.",
                f"Süper, {len(room_list)} derslik hazır.",
                "Güzel, derslikler tamam.",
            ])
            step = random.choice([
                "Şimdi öğretmenleri ekleyelim. Adlarını ve verdikleri dersi söyle. (Örnek: 'Ahmet Yılmaz, Matematik öğretmeni ekle')",
                "Sıra öğretmenlerde: kim hangi dersi veriyor? (Örnek: Ahmet Yılmaz - Matematik)",
                "Şimdi öğretmen kadrosunu girelim. Ad ve branş bilgisiyle söyle. (Örnek: 'Ayşe Demir Türkçe öğretmeni ekle')",
            ])
            payload = {
                "kind": "query",
                "answer": f"{ack} {step}",
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        elif kind == "after_teachers":
            t_list = _short_teachers()
            ctx["subjects"] = _short_subjects()
            ctx["classes"] = _short_classes()
            ctx["rooms"] = _short_rooms()
            ctx["teachers"] = t_list
            request = random.choice(CONT_PROMPTS_GENERIC + [
                "öğretmenleri ekledim",
                "tamam hocalar tamam",
                "evet hepsini ekledim",
            ])
            ack = random.choice([
                f"Güzel, {len(t_list)} öğretmen ekli.",
                "Tamam, öğretmen kadrosu hazır.",
                f"Süper, {len(t_list)} hoca tanımlandı.",
            ])
            step = random.choice([
                "Şimdi ders dağıtımına geçelim: her sınıf hangi dersten kaç saat görecek? (Örnek: '9A sınıfına 5 saat Matematik ekle')",
                "Sıradaki adım: ders dağıtımı. Sınıf bazında kaç saat hangi ders olacak? (Örnek: '9A 5 saat Matematik')",
                "Ders dağıtımına geçiyoruz. Hangi sınıfa hangi dersten kaç saat? (Örnek: '10A sınıfına 4 saat Fizik')",
            ])
            payload = {
                "kind": "query",
                "answer": f"{ack} {step}",
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        else:  
            ctx["subjects"] = _short_subjects()
            ctx["classes"] = _short_classes()
            ctx["rooms"] = _short_rooms()
            ctx["teachers"] = _short_teachers()
            request = random.choice(CONT_PROMPTS_GENERIC + [
                "ders dağıtımını yaptım",
                "tamam aktiviteler hazır",
                "her şey tamam, sırada ne?",
            ])
            step = random.choice([
                "Süper, temel veri tamam. Şimdi kısıtlama varsa söyleyebilirsin (örn. 'Ahmet hoca Cuma yok'), ya da hazırsan 'Programı Üret' diyebilirsin.",
                "Harika, hepsi hazır. Kısıtlama eklemek ister misin? (örn. 'Matematik son derste olmasın'). Yoksa direkt 'Programı Üret'.",
                "Tamamdır, son adım: kısıtlamaları gir (örn. 'Ayşe hoca haftada en fazla 4 gün gelsin'). Hazırsan üretmeye geçebiliriz.",
            ])
            payload = {
                "kind": "query",
                "answer": step,
                "confidence": round(random.uniform(0.88, 0.95), 2),
            }

        out.append(example(ctx, request, payload))
    return out

def gen_run_solver(n: int) -> list[dict]:
    """
    Kullanıcının "programı üret / şimdi başlat / 150 saniyede üret" tarzı
    komutlarına run_solver yanıtı.
    Süre opsiyonel — geçildiyse timeLimitSec parametresinde döner.
    """
    out = []
    sure_phrases_seconds = [
        "{n} saniye", "{n} sn", "{n} saniyede", "{n} sn'de",
        "{n} saniye sürsün", "en fazla {n} saniye", "{n} saniyelik limit",
    ]
    sure_phrases_minutes = [
        "{m} dakika", "{m} dakikada", "{m} dk", "{m} dk'da",
        "{m} dakikalık limit", "{m} dakika sürsün",
    ]
    base_phrases = [
        "Programı üret", "Şimdi üret", "Hadi üret", "Üretmeye başla",
        "Programı şimdi oluştur", "FET'i çalıştır", "Programı hazırla",
        "Hemen üretimi başlat", "Programı yap", "Şimdi başlat",
        "Artık üretebilirsin", "Çözücüyü çalıştır",
        "Programı oluşturmaya başla", "Şimdi programı kur",
        "Üretime geç", "Tamam programı üret",
        "Hadi başlayalım üretime", "Programı kursana",
        "Hazırsam üretebilirsin", "Şimdi programı tamamla",
    ]
    for _ in range(n):

        sec = None
        if random.random() < 0.4:
            if random.random() < 0.6:
                sec = random.choice([60, 90, 120, 150, 180, 240, 300, 600])
                phrase = random.choice(sure_phrases_seconds).format(n=sec)
            else:
                m = random.choice([1, 2, 3, 5, 10])
                sec = m * 60
                phrase = random.choice(sure_phrases_minutes).format(m=m)
            request = f"{random.choice(base_phrases)}. {phrase}."
        else:
            request = f"{random.choice(base_phrases)}."

        ctx = make_context()
        payload = {
            "kind": "run_solver",
            "explanation": (
                f"FET çözücüsünü {sec} saniye üst limitle başlatacağım. "
                f"Onayla, üretim başlasın."
            ) if sec else (
                "FET çözücüsünü mevcut zaman limitiyle başlatacağım. Onayla, üretim başlasın."
            ),
            "confidence": round(random.uniform(0.88, 0.96), 2),
        }
        if sec is not None:
            payload["timeLimitSec"] = sec
        out.append(example(ctx, request, payload))
    return out

def gen_per_class_subject_room(n: int) -> list[dict]:
    """
    Class-filtreli subject-room atamaları. SUBJECT_PREFERRED_ROOM global olduğu
    için bu tip filtreli istekler add_activity_constraint mutation op'u ile
    her ilgili aktiviteye ayrı ACTIVITY_PREFERRED_ROOM kısıtlaması ekler.
    """
    subject_room_pairs = [
        ("Müzik", ["Müzik Sınıfı", "Konferans Salonu", "Bilgisayar Salonu"]),
        ("Fizik", ["Fizik Lab", "Lab1", "Lab2"]),
        ("Kimya", ["Kimya Lab", "Lab1"]),
        ("Biyoloji", ["Biyoloji Lab"]),
        ("Bilişim Teknolojileri", ["Bilgisayar Lab", "BT Sınıfı"]),
        ("Görsel Sanatlar", ["Resim Atölyesi", "Görsel Sanatlar Atölyesi"]),
        ("Beden Eğitimi", ["Spor Salonu", "Bahçe"]),
    ]
    out = []
    for _ in range(n):
        subj, rooms = random.choice(subject_room_pairs)
        room = random.choice(rooms)

        if random.random() < 0.6:
            year = random.choice(["9", "10", "11", "12"])
            class_pool = [f"{year}{ch}" for ch in "ABCDEF"]
            filter_obj = {"classYear": year, "subject": subj}
            filter_desc = f"{year}. sınıfların"
            templates = [
                f"{year}. sınıfların {subj} derslerini {room}'da yap",
                f"{year}. sınıfların {subj} dersleri {room}'da olsun",
                f"{year}. sınıf {subj} derslerini hep {room}'da yap",
                f"{year}. sınıfların {subj.lower()} derslerini {room} dersliğinde yapalım",
                f"Tüm {year}. sınıfların {subj} dersleri {room}'da işlensin",
                f"{year}. sınıflar {subj} dersine {room}'da girsin",
            ]
        else:
            year = random.choice(["9", "10", "11", "12"])
            letter = random.choice("ABCDEF")
            class_name = f"{year}{letter}"
            class_pool = [class_name]
            filter_obj = {"class": class_name, "subject": subj}
            filter_desc = f"{class_name} sınıfının"
            templates = [
                f"{class_name} sınıfının {subj} derslerini {room}'da yap",
                f"{class_name}'ın {subj} dersi {room}'da olsun",
                f"{class_name} {subj}'yi {room} dersliğinde yapsın",
                f"{class_name}'nın {subj} derslerini hep {room}'da yapalım",
            ]
        request = random.choice(templates)

        ctx = make_context(extra_classes=class_pool)
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)

        weight = random.choice([90, 95, 100, 100, 100])

        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "add_activity_constraint",
                    "params": {
                        "type": "ACTIVITY_PREFERRED_ROOM",
                        "filter": filter_obj,
                        "params": {"room": room},
                        "weight": weight,
                    },
                    "description": f"{filter_desc} {subj} dersleri → {room} (her aktiviteye ayrı)",
                }
            ],
            "explanation": (
                f"{filter_desc} {subj} derslerini {room} dersliğinde yapacağım. "
                f"Her eşleşen aktiviteye ayrı bir ACTIVITY_PREFERRED_ROOM kısıtlaması "
                f"eklenir — FET bu derslerin yalnız o derslikte çakışmamasını sağlar."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.85, 0.95), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_constraint_relax(n: int) -> list[dict]:
    """
    Kullanıcı "çözüm bulunamadı / kısıtlamayı gevşet / öneri ver" gibi
    talepleri için, AI mevcut katı kısıtlamaların ağırlığını set_constraint_weight
    mutation op'u ile düşürür.

    Context'te constraints[] array'i geçer; AI bu listeden weight=100 olanları
    seçip 70'e indirir.
    """
    out = []
    constraint_examples = [
        ("Selim hoca tercih edilen derslikler: 201", "TEACHER_PREFERRED_ROOMS"),
        ("Müzik Müzik Sınıfında yapılsın", "SUBJECT_PREFERRED_ROOM"),
        ("9A Cuma yok", "CLASS_NOT_AVAILABLE"),
        ("Ahmet hoca Cuma boş", "TEACHER_NOT_AVAILABLE"),
        ("Kimya günde en fazla 2 saat", "SUBJECT_MAX_HOURS_DAILY"),
        ("Tüm öğretmenler haftada en fazla 4 gün", "ALL_TEACHERS_MAX_DAYS_PER_WEEK"),
        ("Beden son derste olsun", "SUBJECT_LAST_HOUR_OF_DAY"),
        ("9A en fazla 6 saat günde", "CLASS_MAX_HOURS_DAILY"),
    ]
    relax_phrases = [
        "Çözüm bulunamadı, ne yapabilirim?",
        "Programı üretemedik. Hangi kısıtlamaları gevşetebiliriz?",
        "FET hata verdi, kuralları biraz esnek yap",
        "Kısıtlamaları düşürelim, programı çıkaramıyor",
        "Bazı önemleri düşürebilir misin?",
        "Kuralları gevşet, çözüm bulamıyor",
        "Hangi kısıtlamayı esnetebiliriz?",
        "Öneri ver, programı kuramadık",
        "Çözülemedi, ağırlıkları düşür",
        "Nasıl çözeyim bu programı?",
        "Çakışmalar var, kuralları esnet",
        "Programı üret çalışmadı, gevşek modda dene",
    ]

    for _ in range(n):
        ctx = make_context()

        active_constraints = []
        cnum = random.randint(3, 7)
        for i in range(cnum):
            desc, ctype = random.choice(constraint_examples)
            active_constraints.append({
                "id": i + 1,
                "type": ctype,
                "weight": 100,
                "active": True,
                "description": desc,
            })
        ctx["constraints"] = active_constraints

        request = random.choice(relax_phrases)

        chosen = sorted(active_constraints, key=lambda c: -c["weight"])[:min(5, len(active_constraints))]
        actions = [
            {
                "op": "set_constraint_weight",
                "params": {"constraintId": c["id"], "weight": 70},
                "description": f"\"{c['description']}\" → ağırlık {c['weight']} → 70 (esnek)",
            }
            for c in chosen
        ]
        payload = {
            "kind": "data_mutation",
            "actions": actions,
            "explanation": (
                f"Programın üretilememesinin en muhtemel sebebi, ağırlığı 100 olan "
                f"{len(active_constraints)} katı kısıtlama. Aşağıdaki {len(chosen)} "
                f"kısıtlamanın ağırlığını 70'e düşürürsek FET bunları 'tercih' olarak "
                f"görür, tam tatmin edemese bile size en yakın çözümü bulur. "
                f"Onayla, programı tekrar üretelim."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.78, 0.90), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_set_setting(n: int) -> list[dict]:
    """
    Kullanıcı ayarları AI üzerinden değiştirebilsin.
    Desteklenen anahtarlar: fetTimeLimitSec, aiTimeoutSec, theme, aiMode.
    """
    out = []
    samples = [
        ("FET zaman limitini 3 dakika yap", "fetTimeLimitSec", 180),
        ("FET süresini 300 saniye yap", "fetTimeLimitSec", 300),
        ("Üretim limiti 10 dakika olsun", "fetTimeLimitSec", 600),
        ("FET 60 saniye sürsün", "fetTimeLimitSec", 60),
        ("AI timeout 90 saniye olsun", "aiTimeoutSec", 90),
        ("AI bekleme süresi 30 saniye", "aiTimeoutSec", 30),
        ("Üretim zamanını 120 sn yap", "fetTimeLimitSec", 120),
        ("FET çalışma süresini 150 saniyeye ayarla", "fetTimeLimitSec", 150),
        ("Koyu temaya geç", "theme", "dark"),
        ("Karanlık moda al", "theme", "dark"),
        ("Temayı koyu yap", "theme", "dark"),
        ("Gece modu olsun", "theme", "dark"),
        ("Arayüzü koyulaştır", "theme", "dark"),
        ("Açık temaya dön", "theme", "light"),
        ("Aydınlık tema yap", "theme", "light"),
        ("Temayı açık yap", "theme", "light"),
        ("Yerel yapay zekayı kullan", "aiMode", "local"),
        ("AI'ı yerelde çalıştır", "aiMode", "local"),
        ("Yerel modele geç", "aiMode", "local"),
        ("Sunucudan kullan", "aiMode", "server"),
        ("AI'ı sunucuya al", "aiMode", "server"),
        ("Uzak sunucuya geç", "aiMode", "server"),
    ]
    for _ in range(n):
        request, key, value = random.choice(samples)
        ctx = make_context()
        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "set_setting",
                    "params": {"key": key, "value": value},
                    "description": f"Ayar '{key}' = {value}",
                }
            ],
            "explanation": f"'{key}' ayarını {value} olarak güncelleyeceğim. Onayla.",
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.85, 0.95), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_generic_add_constraint(n: int) -> list[dict]:
    """
    AI'nın artık `add_constraint` mutation op'u ile herhangi bir FET kısıtlamasını
    onay-kartlı şekilde ekleyebilmesi için örnekler. (Eski yol: kind:constraint;
    yeni yol: kind:data_mutation + op:add_constraint — daha tutarlı UX.)
    """
    out = []
    patterns = [
        ("Ahmet hocaya 3 ders bos saat yasagi koy", "TEACHER_MAX_GAPS_PER_DAY",
         lambda t: {"teacher": t, "maxGaps": 3}, ["Ahmet Yılmaz"]),
        ("9A günde en fazla 7 ders alsın", "CLASS_MAX_HOURS_DAILY",
         lambda c: {"class": c, "maxHours": 7}, ["9A"]),
        ("Beden Eğitimi her gün son derste", "SUBJECT_LAST_HOUR_OF_DAY",
         lambda s: {"subject": s}, []),
        ("Kimya günde maksimum 2 saat", "SUBJECT_MAX_HOURS_DAILY",
         lambda s: {"subject": s, "maxHours": 2}, []),
        ("Tüm öğretmenler haftada en fazla 4 gün", "ALL_TEACHERS_MAX_DAYS_PER_WEEK",
         lambda _: {"maxDays": 4}, []),
    ]
    for _ in range(n):
        request, ctype, build_params, extras = random.choice(patterns)
        ctx = make_context(extra_teachers=[e for e in extras if " " in e] or None,
                          extra_classes=[e for e in extras if " " not in e and e[0].isdigit()] or None)

        if ctype.startswith("TEACHER"):
            target = extras[0] if extras else random.choice(ctx["teachers"])
            params = build_params(target)
        elif ctype.startswith("CLASS"):
            target = extras[0] if extras else random.choice(ctx["classes"])
            params = build_params(target)
        elif ctype.startswith("SUBJECT"):
            target = random.choice(ctx["subjects"])
            params = build_params(target)
        else:
            params = build_params(None)
        weight = random.choice([90, 95, 100, 100])
        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": "add_constraint",
                "params": {"type": ctype, "weight": weight, "params": params},
                "description": f"{ctype} eklendi (weight={weight})",
            }],
            "explanation": f"'{ctype}' türünde bir kısıtlama ekleyeceğim. Onayla, kaydedeyim.",
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.82, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

DAYS_FULL_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]

def gen_split_activities(n: int) -> list[dict]:
    """
    "9A sanat saatinde 2 gruba bölünür: görsel sanatlar ve müzik"
    """
    pairs_2 = [
        ("Görsel Sanatlar", "Resim Atölyesi"),
        ("Müzik", "Müzik Sınıfı"),
        ("Drama", None),
        ("Tasarım Teknoloji", "Atölye"),
        ("Bilişim Teknolojileri", "Bilgisayar Lab"),
        ("Robotik", "Bilgisayar Lab"),
        ("Almanca", None),
        ("İspanyolca", None),
        ("Fransızca", None),
        ("Spor", "Spor Salonu"),
    ]
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12", "7", "8"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        group_count = random.choice([2, 2, 2, 3])  
        sample = random.sample(pairs_2, group_count)
        hours = random.choice([1, 2, 2, 2, 3])
        groups_for_request = [s[0] for s in sample]

        templates = [
            f"{cls} sanat saatinde {group_count} gruba bölünür: {' ve '.join(groups_for_request)}",
            f"{cls} sınıfı {group_count} gruba ayrılır, {' ve '.join(groups_for_request)} dersi alıyor",
            f"{cls} öğrencileri {hours} saat boyunca {group_count} gruba bölünsün: {', '.join(groups_for_request)}",
            f"{cls} aynı saatte {group_count} farklı ders alacak: {', '.join(groups_for_request)}",
            f"{cls} sınıfını ikiye böl, {groups_for_request[0]} ve {groups_for_request[1]} aynı saatte olsun" if group_count == 2 else
              f"{cls} sınıfı 3 gruba bölünsün: {', '.join(groups_for_request)}",
        ]
        request = random.choice(templates)

        ctx = make_context(extra_classes=[cls])
        for s, room in sample:
            if s not in ctx["subjects"]:
                ctx["subjects"].append(s)
            if room and room not in ctx["rooms"]:
                ctx["rooms"].append(room)

        actions = [{
            "op": "add_split_activity",
            "params": {
                "class": cls,
                "weeklyHours": hours,
                "groups": [
                    {
                        "subject": s,
                        **({"room": room} if room else {}),
                    }
                    for s, room in sample
                ],
            },
            "description": f"{cls} → {group_count} grup ({' | '.join(groups_for_request)}), {hours} saat",
        }]
        payload = {
            "kind": "data_mutation",
            "actions": actions,
            "explanation": (
                f"{cls} sınıfını {group_count} gruba böleceğim: {', '.join(groups_for_request)}. "
                f"Tüm gruplar aynı saatte başlayacak (FET ConstraintActivitiesSameStartingTime ile zorlanır). "
                f"Her grup için haftalık {hours} saat aktivite oluşturulacak."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.82, 0.94), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_set_timetable_slot(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        ctx = make_context(extra_classes=[cls])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        hour = random.randint(1, H)
        subj = random.choice(SUBJECTS)
        templates = [
            f"{cls} {day} {hour}. ders {subj} olsun",
            f"{cls} sınıfının {day} günü {hour}. dersini {subj} olarak kilitle",
            f"{cls} {day} {hour}. dersine {subj}'yi sabitle",
            f"{cls} {day} {hour}. ders'i {subj} yap",
            f"{cls} için {day} {hour}. ders {subj} olarak ayarla",
        ]
        request = random.choice(templates)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": "set_timetable_slot",
                "params": {"class": cls, "day": day, "hour": hour, "subject": subj},
                "description": f"{cls} {day} {hour}. ders → {subj} (kilit)",
            }],
            "explanation": (
                f"{cls} sınıfının {day} günü {hour}. dersini {subj} olarak kilitleyeceğim. "
                f"Programı yeniden ürettiğinde FET bu slot'u koruyacak."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.85, 0.95), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_lock_unlock_slot(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        ctx = make_context(extra_classes=[cls])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        hour = random.randint(1, H)
        is_lock = random.random() < 0.7

        if is_lock:
            templates = [
                f"{cls} {day} {hour}. ders'i kilitle, değişmesin",
                f"{cls} sınıfının {day} {hour}. ders'i sabit kalsın yeniden üretirken",
                f"Şu slotu kilitle: {cls} {day} {hour}",
                f"{cls} {day} {hour}. ders kilidini koy, FET dokunmasın",
            ]
            op = "lock_timetable_slot"
            desc = f"{cls} {day} {hour}. ders kilitlendi"
            expl = f"{cls} {day} {hour}. dersini mevcut haliyle kilitleyeceğim — yeniden üretildiğinde FET bu slot'u değiştirmeyecek."
        else:
            templates = [
                f"{cls} {day} {hour}. ders kilidini aç",
                f"{cls} {day} {hour}. dersi serbest bırak",
                f"{cls} {day} {hour}. ders kilidini kaldır",
                f"Kilidi kaldır: {cls} {day} {hour}",
            ]
            op = "unlock_timetable_slot"
            desc = f"{cls} {day} {hour}. ders kilidi kaldırıldı"
            expl = f"{cls} {day} {hour}. dersinin kilidini kaldıracağım — FET yeniden üretirken bu slot'u serbest bırakacak."

        request = random.choice(templates)
        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": op,
                "params": {"class": cls, "day": day, "hour": hour},
                "description": desc,
            }],
            "explanation": expl,
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.85, 0.95), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_substitute_teacher(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        subj = random.choice(SUBJECTS)
        old_t = random.choice(TEACHERS)
        new_t = random.choice([t for t in TEACHERS if t != old_t])
        templates = [
            f"{old_t} hocanın {cls} {subj}'ini {new_t}'e ver",
            f"{cls} {subj} dersinde {old_t} yerine {new_t} olsun",
            f"{cls} {subj}'i {new_t}'e ata, {old_t} bıraksın",
            f"{cls} sınıfının {subj} dersini artık {new_t} versin",
            f"{new_t} hocayı {cls} {subj}'e ata, {old_t}'in yerine",
        ]
        request = random.choice(templates)
        ctx = make_context(
            extra_classes=[cls],
            extra_teachers=[old_t, new_t],
        )
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": "substitute_teacher",
                "params": {
                    "class": cls,
                    "subject": subj,
                    "newTeacher": new_t,
                    "fromTeacher": old_t,
                },
                "description": f"{cls} × {subj} → öğretmen: {new_t}",
            }],
            "explanation": (
                f"{cls} sınıfının {subj} dersinin öğretmenini {old_t} → {new_t} olarak değiştireceğim. "
                f"{new_t} hocaya {subj} yeterliliği yoksa otomatik linkleyeceğim."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.82, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_merge_activities(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        classes_pool = [f"{cls_year}{ch}" for ch in "ABCDEF"]
        merge_count = random.choice([2, 2, 2, 3])
        classes = random.sample(classes_pool, merge_count)
        subj = random.choice([
            "Müzik Dinleme", "Konferans", "Tören", "Drama Gösterisi",
            "Seminer", "Müzik", "Beden Eğitimi", "Sınav"
        ])
        teacher = random.choice(TEACHERS) if random.random() < 0.7 else None
        room = random.choice(["Konferans Salonu", "Spor Salonu", "Bahçe"]) if random.random() < 0.6 else None
        hours = random.choice([1, 2])
        join = " ve " if merge_count == 2 else ", "
        templates = [
            f"{join.join(classes)} beraber {subj} alacak" + (f" ({teacher} hoca)" if teacher else ""),
            f"{join.join(classes)} aynı saatte {subj}'a katılsın",
            f"{join.join(classes)} birlikte {subj}'a girsin",
            f"{join.join(classes)} ortak {subj} olsun" + (f" {room}'da" if room else ""),
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=classes, extra_teachers=[teacher] if teacher else None)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        if room and room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        params = {
            "classes": classes,
            "subject": subj,
            "weeklyHours": hours,
        }
        if teacher:
            params["teacher"] = teacher
        if room:
            params["room"] = room
        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": "merge_activities",
                "params": params,
                "description": f"{' + '.join(classes)} → {subj} birleşik ({hours} saat)",
            }],
            "explanation": (
                f"{', '.join(classes)} sınıflarını {subj} dersinde birleştireceğim. "
                f"Bu sınıflar aynı saatte aynı öğretmenle aynı odada dersi alır (FET aynı saatte başlamaya zorlar)."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.80, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_export_timetable(n: int) -> list[dict]:
    out = []
    fmt_phrases = [
        ("pdf", ["PDF olarak indir", "PDF al", "PDF çıktısı al", "PDF'e aktar", "yazdırılabilir PDF", "PDF kaydet"]),
        ("excel", ["Excel'e aktar", "XLSX olarak indir", "Excel dosyası al", "Excel'e kaydet"]),
        ("html", ["HTML olarak indir", "HTML çıktısı al", "web sayfası olarak kaydet"]),
    ]
    for _ in range(n):
        fmt, phrases = random.choice(fmt_phrases)
        with_class = random.random() < 0.6
        if with_class:
            cls_year = random.choice(["9", "10", "11", "12"])
            cls_letter = random.choice("ABCDEF")
            cls = f"{cls_year}{cls_letter}"
            phrase = random.choice(phrases)
            templates = [
                f"{cls} programını {phrase}",
                f"{cls} sınıfının haftalık programını {phrase}",
                f"{cls} için {phrase}",
            ]
            request = random.choice(templates)
            params = {"format": fmt, "class": cls}
            desc = f"{cls} programı → {fmt.upper()}"
            expl = f"{cls} sınıfının programını {fmt.upper()} olarak export edeceğim. Program sayfasına geçilecek ve indirme tetiklenecek."
            ctx = make_context(extra_classes=[cls])
        else:
            phrase = random.choice(phrases)
            templates = [
                f"Tüm programı {phrase}",
                f"Programı {phrase}",
                f"Haftalık çizelgeyi {phrase}",
            ]
            request = random.choice(templates)
            params = {"format": fmt}
            desc = f"Tüm program → {fmt.upper()}"
            expl = f"Tüm okul programını {fmt.upper()} olarak export edeceğim. Program sayfasına geçilecek."
            ctx = make_context()

        payload = {
            "kind": "data_mutation",
            "actions": [{
                "op": "export_timetable",
                "params": params,
                "description": desc,
            }],
            "explanation": expl,
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.88, 0.96), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_validate_schedule(n: int) -> list[dict]:
    out = []
    triggers = [
        "Program üretmeye hazır mıyım?",
        "Eksik bir şey var mı?",
        "Program üretmeden önce ne kontrol etmeliyim?",
        "Verileri kontrol et, üretebiliyor muyuz?",
        "Pre-flight check yap",
        "Programı üretmek için hazır mıyım?",
        "Sıkıntı var mı kurulumumda?",
        "Eksiklikleri söyle",
        "Validation yap",
        "Toplam saat hesabı tutuyor mu?",
    ]
    for _ in range(n):
        request = random.choice(triggers)
        ctx = make_context()

        payload = {
            "kind": "tool_call",
            "tool": "validateSchedule",
            "args": {},
            "reasoning": "Kullanıcı 'hazır mıyım?' diye sordu — toplam saat, eksik öğretmen vb. doğrulama için validateSchedule çağırıyorum."
        }
        out.append(example(ctx, request, payload))
    return out

def gen_timetable_stats(n: int) -> list[dict]:
    out = []
    triggers_global = [
        "Kaç slot oluştu?", "En yoğun gün hangisi?", "En çok ders veren öğretmen kim?",
        "Toplam çakışma var mı?", "Programın istatistiği",
        "Hangi gün en az ders var?", "En çok hangi derslik kullanılıyor?",
        "Programın özeti", "Çizelge analizi",
    ]
    triggers_class = [
        "{cls} kaç ders aldı?", "{cls} programı kaç slot?",
        "{cls} sınıfının yoğunluğu nasıl?", "{cls} programı analiz",
        "{cls}'ın en yoğun günü", "{cls} kaç boş saat var?",
    ]
    for _ in range(n):
        with_class = random.random() < 0.5
        if with_class:
            cls_year = random.choice(["9", "10", "11", "12"])
            cls_letter = random.choice("ABCDEF")
            cls = f"{cls_year}{cls_letter}"
            request = random.choice(triggers_class).format(cls=cls)
            args = {"class": cls}
            ctx = make_context(extra_classes=[cls])
        else:
            request = random.choice(triggers_global)
            args = {}
            ctx = make_context()
        payload = {
            "kind": "tool_call",
            "tool": "getTimetableStats",
            "args": args,
            "reasoning": "Kullanıcı çizelge istatistiği istedi — getTimetableStats çağırıyorum, sonucu query olarak özetleyeceğim."
        }
        out.append(example(ctx, request, payload))
    return out

def _tool_call(tool: str, args: dict, reasoning: str) -> dict:
    return {
        "kind": "tool_call",
        "tool": tool,
        "args": args,
        "reasoning": reasoning,
    }

def gen_timetable_query(n: int) -> list[dict]:
    """
    Kullanıcı üretilmiş çizelge hakkında sorular sorar — AI doğru tool_call
    yapmalı. 7 alt-senaryo (A-G), her birinde geniş template havuzu.

    Dağıtım (300 dict'te): A=80, B=50, C=50, D=40, E=30, F=25, G=25
    """
    out = []
    out += _gen_q_slot(int(n * 80 / 300))
    out += _gen_q_class_tt(int(n * 50 / 300))
    out += _gen_q_teacher_tt(int(n * 50 / 300))
    out += _gen_q_room_tt(int(n * 40 / 300))
    out += _gen_q_day_tt(int(n * 30 / 300))
    out += _gen_q_who_teaching(int(n * 25 / 300))
    out += _gen_q_free_slots(int(n * 25 / 300))

    while len(out) < n:
        out += _gen_q_slot(1)
    return out[:n]

def _gen_q_slot(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        ctx = make_context(extra_classes=[cls])
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)

        special = random.random()
        if special < 0.10:
            hour = H
            phrasings = [
                f"{cls} {day} son ders kim?",
                f"{cls} {day} son saat hangi öğretmen?",
                f"{cls} sınıfının {day} son dersi kim veriyor?",
                f"{cls} için {day} son saat ne?",
                f"{cls} {day} günü son ders kim?",
            ]
        elif special < 0.18:
            hour = 1
            phrasings = [
                f"{cls} {day} ilk ders kim?",
                f"{cls} {day} 1. ders hangi öğretmen?",
                f"{cls} sınıfının {day} ilk dersi ne?",
                f"{cls} {day} günü ilk ders kim veriyor?",
            ]
        else:
            hour = random.randint(1, H)
            phrasings = [
                f"{cls} {day} {hour}. ders kim?",
                f"{cls} {day} {hour}. saat hangi öğretmen?",
                f"{cls} {day} {hour}. ders hangi derslik?",
                f"{cls} sınıfının {day} {hour}. dersi ne?",
                f"{cls} için {day} {hour}. ders kim veriyor?",
                f"{cls} {day} {hour} ders kim?",
                f"{cls} {day[:3]} {hour}. ders ne?",
                f"{cls} {day} günü {hour}. saat öğretmen kim?",
                f"{cls} {day} {hour}. saat hangi konu?",
                f"{cls}'nın {day} {hour}. dersi nedir?",
                f"{cls} {day} {hour}. ders hangi ders?",
                f"{cls} {day} {hour}. saat öğretmen ne yapıyor?",
            ]
        request = random.choice(phrasings)
        payload = _tool_call(
            "getTimetableSlot",
            {"class": cls, "day": day, "hour": hour},
            f"Kullanıcı {cls} {day} {hour}. derste kim/ne sordu — getTimetableSlot ile çizelgeden çekiyorum.",
        )
        out.append(example(ctx, request, payload))
    return out

def _gen_q_class_tt(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        phrasings = [
            f"{cls} programını göster",
            f"{cls} haftalık programı nedir?",
            f"{cls} neler alıyor bu hafta?",
            f"{cls} sınıfının çizelgesi",
            f"{cls} nasıl bir program oldu?",
            f"{cls} için programı listele",
            f"{cls} programını aç",
            f"{cls}'nın haftalık dersleri",
            f"{cls} ders programı",
            f"{cls} çizelgesi nasıl oluştu?",
            f"{cls}'nin tam programı",
            f"{cls}'nın ders dağılımı",
            f"{cls} sınıfı haftalık planı",
            f"{cls} için hangi dersler hangi günde?",
            f"{cls}'in programını aç bakayım",
        ]
        request = random.choice(phrasings)
        ctx = make_context(extra_classes=[cls])
        payload = _tool_call(
            "getClassTimetable",
            {"class": cls},
            f"Kullanıcı {cls} sınıfının tam programını istedi — getClassTimetable ile grid'i çekiyorum.",
        )
        out.append(example(ctx, request, payload))
    return out

def _gen_q_teacher_tt(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        teacher = random.choice(TEACHERS)
        first = teacher.split()[0] if " " in teacher else teacher
        phrasings = [
            f"{teacher} ne zaman ders veriyor?",
            f"{teacher}'in haftalık programı",
            f"{teacher} hocanın derslerini göster",
            f"{first}'in programı",
            f"{teacher} hocanın çizelgesi",
            f"{first} öğretmenin haftalık dersleri",
            f"{teacher} hangi günler ders veriyor?",
            f"{first} hocanın programı nedir?",
            f"{teacher} ne zamanlar derse giriyor?",
            f"{first} hoca haftada hangi dersleri veriyor?",
            f"{teacher}'in programını göster",
            f"{first} hocanın çizelgesini ver",
        ]
        request = random.choice(phrasings)
        ctx = make_context(extra_teachers=[teacher])
        payload = _tool_call(
            "getTeacherTimetable",
            {"teacher": teacher},
            f"Kullanıcı {teacher} öğretmenin haftalık programını istedi — getTeacherTimetable çağırıyorum.",
        )
        out.append(example(ctx, request, payload))
    return out

def _gen_q_room_tt(n: int) -> list[dict]:
    out = []
    rooms_pool = [
        "Lab1", "Lab2", "Fizik Lab", "Kimya Lab", "Biyoloji Lab",
        "BT Sınıfı", "Bilgisayar Lab", "Müzik Sınıfı", "Spor Salonu",
        "Konferans Salonu", "Resim Atölyesi", "201", "202", "203", "105",
    ]
    for _ in range(n):
        room = random.choice(rooms_pool)
        phrasings = [
            f"{room} ne zaman kullanılıyor?",
            f"{room} programı",
            f"{room} ne zaman boş?",
            f"{room} kullanım takvimi",
            f"{room} haftalık",
            f"{room} dersliği ne zaman kullanılıyor?",
            f"{room} programını göster",
            f"{room}'da hangi günler ders var?",
            f"{room} kullanım çizelgesi",
            f"{room} dersliğinin haftalık programı",
        ]
        request = random.choice(phrasings)
        ctx = make_context()
        if room not in ctx["rooms"]:
            ctx["rooms"].append(room)
        payload = _tool_call(
            "getRoomTimetable",
            {"room": room},
            f"Kullanıcı {room} dersliğinin haftalık kullanımını istedi — getRoomTimetable çağırıyorum.",
        )
        out.append(example(ctx, request, payload))
    return out

def _gen_q_day_tt(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        with_class = random.random() < 0.4
        if with_class:
            cls_year = random.choice(["9", "10", "11", "12"])
            cls_letter = random.choice("ABCDEF")
            cls = f"{cls_year}{cls_letter}"
            ctx = make_context(extra_classes=[cls])
            day = random.choice(ctx["days"])
            phrasings = [
                f"{day} günü {cls}'nın dersleri",
                f"{day} {cls} programı",
                f"{cls} {day} günü ne var?",
                f"{day} günü {cls}'da neler var?",
                f"{cls}'nın {day} programı",
            ]
            request = random.choice(phrasings)
            args = {"day": day, "class": cls}
            reasoning = f"Kullanıcı {cls} sınıfının {day} günündeki dersleri istedi — getDayTimetable class filter ile."
        else:
            ctx = make_context()
            day = random.choice(ctx["days"])
            phrasings = [
                f"{day} günü ne dersler var?",
                f"{day} günü tüm sınıflar",
                f"{day} programı",
                f"{day} günü ne oluyor?",
                f"{day} haftalık planda ne var?",
                f"{day} dersleri",
            ]
            request = random.choice(phrasings)
            args = {"day": day}
            reasoning = f"Kullanıcı {day} günü tüm derslerini istedi — getDayTimetable çağırıyorum."
        payload = _tool_call("getDayTimetable", args, reasoning)
        out.append(example(ctx, request, payload))
    return out

def _gen_q_who_teaching(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        ctx = make_context()
        D, H = ctx["days"], ctx["hoursPerDay"]
        day = random.choice(D)
        hour = random.randint(1, H)
        phrasings = [
            f"{day} {hour}. ders kim hangi sınıfta?",
            f"{day} {hour}. derste kim ders veriyor?",
            f"{day} {hour}. saatte herkes nerede?",
            f"{day} {hour}. ders kimler nerede?",
            f"{day} {hour}. saatte öğretmenler ne yapıyor?",
            f"{day} günü {hour}. saatte hangi sınıfta kim?",
            f"{day} {hour}. ders kim girer?",
            f"{day} saat {hour}'de ne oluyor?",
        ]
        request = random.choice(phrasings)
        payload = _tool_call(
            "whoIsTeaching",
            {"day": day, "hour": hour},
            f"Kullanıcı {day} {hour}. saatteki tüm dersleri istedi — whoIsTeaching çağırıyorum.",
        )
        out.append(example(ctx, request, payload))
    return out

def _gen_q_free_slots(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        choice = random.choice(["class", "teacher", "room"])
        if choice == "class":
            cls_year = random.choice(["9", "10", "11", "12"])
            cls_letter = random.choice("ABCDEF")
            cls = f"{cls_year}{cls_letter}"
            phrasings = [
                f"{cls}'nın boş saatleri ne zaman?",
                f"{cls}'da hangi günler boş yer var?",
                f"{cls} ne zaman boş?",
                f"{cls}'nın boş slotları",
                f"{cls}'nın müsait saatleri",
            ]
            args = {"class": cls}
            ctx = make_context(extra_classes=[cls])
            reasoning = f"Kullanıcı {cls} sınıfının boş slot'larını istedi."
        elif choice == "teacher":
            teacher = random.choice(TEACHERS)
            first = teacher.split()[0] if " " in teacher else teacher
            phrasings = [
                f"{teacher} ne zaman boş?",
                f"{first}'in boş saatleri",
                f"{teacher} hocanın boş saatleri",
                f"{first} hangi saatlerde müsait?",
                f"{teacher} ne zamanlar boş?",
            ]
            args = {"teacher": teacher}
            ctx = make_context(extra_teachers=[teacher])
            reasoning = f"Kullanıcı {teacher} öğretmenin boş slot'larını istedi."
        else:
            room = random.choice(["Lab1", "Lab2", "BT Sınıfı", "Müzik Sınıfı", "201", "302", "Konferans Salonu"])
            phrasings = [
                f"{room} ne zaman boş?",
                f"{room} müsait saatleri",
                f"{room} ne zaman müsait?",
                f"{room} dersliğinin boş zamanları",
            ]
            args = {"room": room}
            ctx = make_context()
            if room not in ctx["rooms"]:
                ctx["rooms"].append(room)
            reasoning = f"Kullanıcı {room} dersliğinin boş slot'larını istedi."
        request = random.choice(phrasings)
        payload = _tool_call("getFreeSlots", args, reasoning)
        out.append(example(ctx, request, payload))
    return out

def _block_phrase(block: int) -> str:
    if block == 1:
        return random.choice(["1'er saat", "tek tek"])
    return random.choice([
        f"blok {block}",
        f"günde {block} ders yan yana",
        f"{block}'şer ders blok",
        f"{block} ders peş peşe",
        f"blok ders ({block})",
        f"{block}'er ders bir arada",
    ])

def _year_phrase(year: str, mode: str) -> str:
    return {
        "ların": f"{year}. sınıfların",
        "lara": f"{year}. sınıflara",
        "lar": f"{year}. sınıflar",
        "tum": f"tüm {year}. sınıfların",
        "tum_lara": f"tüm {year}. sınıflara",
    }[mode]

def gen_filtered_activity_update(n: int) -> list[dict]:
    """
    "9. sınıfların fizik dersi 6 saat olsun, günde 2 ders yan yana"
    → multi-action update_activity (her 9. sınıf için ayrı).
    """
    out = []
    for _ in range(n):

        years = random.choices(
            [["9"], ["10"], ["11"], ["12"], ["9", "10"], ["10", "11"], ["11", "12"]],
            weights=[3, 3, 3, 3, 1, 1, 1],
            k=1,
        )[0]
        letter_count = random.randint(2, 5)
        letters = list("ABCDEF")[:letter_count]
        all_classes: list[str] = []
        for y in years:
            for l in letters:
                all_classes.append(f"{y}{l}")
        subj = random.choice(SUBJECTS)
        hours = random.choice([2, 3, 4, 5, 6])
        block = random.choice([1, 2])
        block_phr = _block_phrase(block)

        if len(years) == 1:
            year_mode = random.choice(["ların", "lara", "lar", "tum"])
            year_text = _year_phrase(years[0], year_mode)
            templates = [
                f"{year_text} {subj.lower()} dersi {hours} saat olsun, {block_phr}",
                f"{year_text} {subj.lower()} {hours} saat, {block_phr}",
                f"{year_text} {subj.lower()} dersini {hours} saat yap, {block_phr}",
                f"{year_text} için {subj.lower()} {hours} saat olsun ({block_phr})",
                f"{year_text} {subj} dersi haftalık {hours} saat, {block_phr} olsun",
                f"{year_text} {subj.lower()} {hours} saatlik, blok süresi {block}",
            ] if block > 1 else [
                f"{year_text} {subj.lower()} {hours} saat olsun",
                f"{year_text} {subj.lower()} dersi {hours} saat",
                f"{year_text} için {subj.lower()} haftalık {hours} saat",
                f"{year_text} {subj} dersi {hours} saat olsun",
            ]
        else:
            year_text = " ve ".join(f"{y}." for y in years) + " sınıfların"
            templates = [
                f"{year_text} {subj.lower()} {hours} saat, {block_phr}",
                f"{year_text} {subj.lower()} dersi {hours} saat olsun",
                f"{year_text} {subj.lower()} dersini {hours} saatlik yap, {block_phr}",
            ]
        request = random.choice(templates)

        ctx = make_context(extra_classes=all_classes)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)

        actions = []
        for cls in all_classes:
            actions.append({
                "op": "update_activity",
                "params": {
                    "class": cls,
                    "subject": subj,
                    "weeklyHours": hours,
                    "blockDuration": block,
                },
                "description": f"{cls} {subj.lower()}: {hours} saat / blok {block}",
            })

        explanation = (
            f"{', '.join(years)}. sınıfların tamamı için {subj} dersini haftalık {hours} saat, "
            f"günde {block} ders yan yana (blockDuration={block}) olarak güncelleyeceğim. "
            f"Toplam {len(all_classes)} sınıf etkilenecek."
        )

        payload = {
            "kind": "data_mutation",
            "actions": actions,
            "explanation": explanation,
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.80, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_filtered_activity_add(n: int) -> list[dict]:
    """
    Aynı pattern ama YENİ aktivite ekleme.
    "9. sınıflara X dersinden Y saat ekle"
    """
    out = []
    for _ in range(n):
        years = random.choices(
            [["9"], ["10"], ["11"], ["12"], ["9", "10"], ["10", "11"]],
            weights=[3, 3, 3, 3, 1, 1],
            k=1,
        )[0]
        letter_count = random.randint(2, 5)
        letters = list("ABCDEF")[:letter_count]
        all_classes: list[str] = []
        for y in years:
            for l in letters:
                all_classes.append(f"{y}{l}")
        subj = random.choice(SUBJECTS)
        hours = random.choice([1, 2, 3, 4])
        block = random.choice([1, 1, 1, 2])

        if len(years) == 1:
            year_mode = random.choice(["ların", "lara", "tum_lara"])
            year_text = _year_phrase(years[0], year_mode)
            block_part = f", {_block_phrase(block)}" if block > 1 else ""
            templates = [
                f"{year_text} {subj.lower()} dersinden {hours} saat ekle{block_part}",
                f"{year_text} {hours} saat {subj.lower()} ekle{block_part}",
                f"{year_text} {subj} dersini ekle, haftalık {hours} saat{block_part}",
                f"{year_text} {subj.lower()} {hours} saatlik ekle{block_part}",
                f"{year_text} için {subj.lower()} {hours} saat oluştur{block_part}",
            ]
        else:
            year_text = " ve ".join(f"{y}." for y in years) + " sınıflara"
            block_part = f", {_block_phrase(block)}" if block > 1 else ""
            templates = [
                f"{year_text} {subj.lower()} {hours} saat ekle{block_part}",
                f"{year_text} {subj.lower()} dersini ekle ({hours} saat){block_part}",
            ]
        request = random.choice(templates)

        ctx = make_context(extra_classes=all_classes)
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)

        actions = []
        for cls in all_classes:
            params = {
                "class": cls,
                "subject": subj,
                "weeklyHours": hours,
            }
            if block > 1:
                params["blockDuration"] = block
            actions.append({
                "op": "add_activity",
                "params": params,
                "description": f"{cls} → {subj} ({hours} saat" + (f", blok {block}" if block > 1 else "") + ")",
            })

        explanation = (
            f"{', '.join(years)}. sınıfların tamamına {subj} dersinden haftalık {hours} saat "
            + (f"({_block_phrase(block)}) " if block > 1 else "")
            + f"ekleyeceğim. Toplam {len(all_classes)} sınıf için ayrı aktivite oluşturulacak."
        )

        payload = {
            "kind": "data_mutation",
            "actions": actions,
            "explanation": explanation,
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.82, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_slot_swap(n: int) -> list[dict]:
    """
    "9A salı 3 ile cuma 5 yer değiştirsin" → swap_timetable_slots
    Bazen aynı sınıf içi, bazen iki farklı sınıf.
    """
    out = []
    for _ in range(n):
        same_class = random.random() < 0.7
        cls1_year = random.choice(["9", "10", "11", "12"])
        cls1_letter = random.choice("ABCDEF")
        cls1 = f"{cls1_year}{cls1_letter}"
        if same_class:
            cls2 = cls1
        else:
            cls2_year = random.choice(["9", "10", "11", "12"])
            cls2_letter = random.choice("ABCDEF")
            cls2 = f"{cls2_year}{cls2_letter}"
        ctx = make_context(extra_classes=[cls1, cls2])
        D, H = ctx["days"], ctx["hoursPerDay"]
        if len(D) >= 2:
            day1, day2 = random.sample(D, 2)
        else:
            day1 = day2 = D[0]
        hour1 = random.randint(1, H)
        hour2 = random.randint(1, H)

        if same_class:
            templates = [
                f"{cls1} {day1} {hour1} ile {day2} {hour2} ders yer değiştirsin",
                f"{cls1} {day1} {hour1}. ders ile {day2} {hour2}. ders yer değiştirsin",
                f"{cls1} sınıfının {day1} {hour1}. dersi ile {day2} {hour2}. dersi swap olsun",
                f"{cls1} {day1}/{hour1} ↔ {day2}/{hour2} yer değiştir",
                f"{cls1} için {day1} {hour1}. saati {day2} {hour2}. saatle değiştir",
                f"{cls1}'da {day1} {hour1}. ders {day2} {hour2}. derse taşınsın, eskisi yerine onun değişsin",
            ]
        else:
            templates = [
                f"{cls1} {day1} {hour1} ile {cls2} {day2} {hour2} yer değiştirsin",
                f"{cls1}'nın {day1} {hour1}. dersi ile {cls2}'nın {day2} {hour2}. dersi swap",
                f"{cls1} {day1} {hour1}. ders ile {cls2} {day2} {hour2}. ders değişsin",
            ]
        request = random.choice(templates)
        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "swap_timetable_slots",
                    "params": {
                        "slot1": {"class": cls1, "day": day1, "hour": hour1},
                        "slot2": {"class": cls2, "day": day2, "hour": hour2},
                    },
                    "description": f"{cls1} {day1}/{hour1} ↔ {cls2} {day2}/{hour2}",
                }
            ],
            "explanation": (
                f"{cls1} {day1} {hour1}. ders ile {cls2} {day2} {hour2}. ders'i yer değiştireceğim. "
                f"Her iki aktiviteye ACTIVITY_FIXED_TIME constraint eklenir; programı yeniden üretince FET uygular."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.80, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_pair_subjects_consecutive(n: int) -> list[dict]:
    """
    "9A için Fizik ve Matematik peş peşe olsun" → pair_subjects_consecutive
    """
    out = []
    pairs = [
        ("Fizik", "Matematik"),
        ("Matematik", "Geometri"),
        ("Kimya", "Biyoloji"),
        ("Türkçe", "Edebiyat"),
        ("Tarih", "Coğrafya"),
        ("Fizik", "Kimya"),
        ("İngilizce", "Almanca"),
    ]
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        s1, s2 = random.choice(pairs)
        templates = [
            f"{cls} için {s1} ve {s2} peş peşe olsun",
            f"{cls} sınıfında {s1}'den hemen sonra {s2} olsun",
            f"{cls} {s1} ile {s2} ardışık olsun",
            f"{cls} için {s1} {s2} bir arada (peş peşe)",
            f"{cls} {s1} dersi bittikten hemen sonra {s2} başlasın",
            f"{cls} {s1} ve {s2} art arda gelsin",
            f"{cls}'da {s1} → {s2} ardışık yap",
            f"{cls} için lab-teorik gibi: {s1} sonra {s2}",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        for s in (s1, s2):
            if s not in ctx["subjects"]:
                ctx["subjects"].append(s)
        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "pair_subjects_consecutive",
                    "params": {"class": cls, "subject1": s1, "subject2": s2},
                    "description": f"{cls} → '{s1}' hemen ardından '{s2}'",
                }
            ],
            "explanation": (
                f"{cls} sınıfında '{s1}' bittikten hemen sonra '{s2}' başlamasını zorunlu kılan "
                f"TWO_ACTIVITIES_CONSECUTIVE kısıtlaması ekleyeceğim. FET bu iki aktiviteyi aynı günde "
                f"peş peşe yerleştirecek."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.82, 0.92), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_subject_spread_days(n: int) -> list[dict]:
    """
    "Matematik 4 saat ama farklı 4 günde olsun" → 2-constraint combo:
    1) add_activity (veya update_activity) ile weeklyHours=4, blockDuration=1
    2) add_constraint SUBJECT_MAX_HOURS_DAILY {subject, maxHours=1}
    """
    out = []
    for _ in range(n):
        cls_year = random.choice(["9", "10", "11", "12"])
        cls_letter = random.choice("ABCDEF")
        cls = f"{cls_year}{cls_letter}"
        subj = random.choice(SUBJECTS)
        hours = random.choice([3, 4, 5])
        templates = [
            f"{cls} {subj.lower()} {hours} saat ama farklı {hours} günde olsun",
            f"{cls} {subj} dersi {hours} saat, farklı günlere yayılsın",
            f"{cls} için {subj.lower()} haftalık {hours} saat ve günde 1 dersten fazla olmasın",
            f"{cls} {subj} {hours} saat olsun, hepsi farklı günde",
            f"{cls} {subj.lower()} {hours} saat, 1'er ders günde",
            f"{cls} {subj} {hours} farklı güne yayılarak {hours} saat",
        ]
        request = random.choice(templates)
        ctx = make_context(extra_classes=[cls])
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "update_activity",
                    "params": {
                        "class": cls,
                        "subject": subj,
                        "weeklyHours": hours,
                        "blockDuration": 1,
                    },
                    "description": f"{cls} {subj.lower()}: {hours} saat / blok 1",
                },
                {
                    "op": "add_constraint",
                    "params": {
                        "type": "SUBJECT_MAX_HOURS_DAILY",
                        "weight": 100,
                        "params": {"subject": subj, "maxHours": 1},
                    },
                    "description": f"{subj} günde en fazla 1 saat (farklı günlere yayılır)",
                },
            ],
            "explanation": (
                f"{cls} sınıfının {subj} dersini haftalık {hours} saat ve günde 1 saat olarak yapılandıracağım. "
                f"weeklyHours={hours} + blockDuration=1 + SUBJECT_MAX_HOURS_DAILY=1 kombinasyonu FET'in dersi "
                f"{hours} ayrı güne yaymasını zorunlu kılar."
            ),
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.80, 0.90), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_page_navigation(n: int) -> list[dict]:
    """
    "Öğretmenler sayfasına geç" → navigate_to
    """
    out = []
    pages = [
        ("teachers", ["Öğretmenler", "öğretmen sayfası", "öğretmenler ekranı"]),
        ("classes", ["Sınıflar", "sınıf sayfası", "sınıflar ekranı"]),
        ("rooms", ["Derslikler", "derslik sayfası", "oda sayfası"]),
        ("subjects", ["Dersler", "ders sayfası", "dersler ekranı"]),
        ("activities", ["Ders Dağılımı", "aktiviteler", "ders dağıtım sayfası"]),
        ("schedule", ["Gün Saat Planı", "saat planı"]),
        ("constraints", ["Kısıtlamalar", "kısıtlama sayfası"]),
        ("generate", ["Programı Üret", "üretim sayfası"]),
        ("timetable", ["Program", "çizelge sayfası", "haftalık program"]),
        ("settings", ["Ayarlar", "ayarlar sayfası", "settings"]),
        ("welcome", ["Başlangıç", "hoş geldin sayfası", "ana sayfa"]),
    ]
    for _ in range(n):
        page, names = random.choice(pages)
        name = random.choice(names)
        templates = [
            f"{name} sayfasına geç",
            f"{name} sayfasını aç",
            f"Beni {name} sayfasına götür",
            f"{name} ekranına git",
            f"{name} sayfasına yönlendir",
            f"{name}'e geç",
        ]
        request = random.choice(templates)
        ctx = make_context()
        payload = {
            "kind": "data_mutation",
            "actions": [
                {
                    "op": "navigate_to",
                    "params": {"page": page},
                    "description": f"/{page} sayfasına geç",
                }
            ],
            "explanation": f"/{page} sayfasına yönlendireceğim.",
            "requiresConfirmation": True,
            "confidence": round(random.uniform(0.86, 0.95), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_multi_step_planning(n: int) -> list[dict]:
    """
    Karmaşık istekler için iteratif tool_call. Model ilk turda bir
    keşif/araştırma tool'u çağırır, reasoning'de "önce X, sonra Y" der.
    """
    out = []
    SCENARIOS = [

        {
            "templates": [
                "{cls}'nın {subject} dersini {day}'a taşı ama {teacher} hocayla çakışmasın",
                "{cls} {subject} dersini {day}'a al, {teacher} ile çakışma olmasın",
                "{subject} dersini {cls}'da {day} gününe taşımak istiyorum ama {teacher}'le çakışmasın",
                "{cls} sınıfının {subject} saatini {day}'a aktar, {teacher} hocayla aynı saate denk gelmesin",
            ],
            "tool": "getTeacherTimetable",
            "args": lambda v: {"teacher": v["teacher"]},
            "reasoning": "Önce {teacher} hocasının {day} günü programına bakmam gerek, sonra {cls} {subject} dersi için uygun saat seçeceğim.",
            "needs": ["cls", "subject", "day", "teacher"],
        },

        {
            "templates": [
                "{teacher} hocanın boş saatlerine {subject} dersi ekle",
                "{teacher} öğretmenin boşlarında {subject} dersi olsun",
                "{teacher}'in müsait saatlerine {subject} koy",
                "{teacher} hocaya boş saatlerine {subject} dersi yerleştir",
            ],
            "tool": "getFreeSlots",
            "args": lambda v: {"teacher": v["teacher"]},
            "reasoning": "Önce {teacher} hocasının boş slot'larını bulmam gerek, sonra oraya {subject} dersini ekleyeceğim.",
            "needs": ["teacher", "subject"],
        },

        {
            "templates": [
                "{day} 1. ders boş olanları bul ve oraya {subject} koy",
                "{day} ilk ders kimde boşsa {subject} ekle",
                "{day} 1. saat boş sınıfları bul, {subject} dersi yerleştir",
                "{day} ilk saat boş olan sınıflara {subject} ata",
            ],
            "tool": "getDayTimetable",
            "args": lambda v: {"day": v["day"]},
            "reasoning": "Önce {day} günü 1. derste hangi sınıfların boş olduğunu görmem gerek, sonra {subject} dersini boş slot'lara ekleyeceğim.",
            "needs": ["day", "subject"],
        },

        {
            "templates": [
                "{room} en az kullanılan derslik mi? Eğer öyleyse {subject} dersini oraya al",
                "{room} dersliği boş duruyor mu? Boşsa oraya {subject} koy",
                "{room} az kullanılıyorsa {subject} dersini oraya taşı",
            ],
            "tool": "getRoomTimetable",
            "args": lambda v: {"room": v["room"]},
            "reasoning": "Önce {room} dersliğinin doluluk durumunu kontrol etmeliyim, sonra {subject} dersini taşıyıp taşımamaya karar vereceğim.",
            "needs": ["room", "subject"],
        },

        {
            "templates": [
                "{subject} derslerini 9. sınıfların hepsine yay, aynı güne 2'den fazla koyma",
                "{subject} dersini tüm 10. sınıflara dağıt, günde 2'den fazla olmasın",
                "11. sınıfların hepsine {subject} dersi ekle, hafta içine yay",
            ],
            "tool": "getClassActivities",
            "args": lambda v: {"classYear": v["year"]},
            "reasoning": "Önce {year}. sınıfların mevcut {subject} aktivitelerini görmem gerek, sonra eksikleri tespit edip eklemeleri yapacağım.",
            "needs": ["year", "subject"],
        },

        {
            "templates": [
                "{teacher} hoca {day} yokmuş, derslerini başka güne taşı",
                "{teacher} öğretmen {day} izinli, dersleri başka güne kaydırılsın",
                "{teacher}'in {day} dersleri başka bir güne alınsın",
            ],
            "tool": "getTeacherTimetable",
            "args": lambda v: {"teacher": v["teacher"]},
            "reasoning": "Önce {teacher} hocasının {day} günü hangi derslere girdiğini görmem gerek, sonra her birini uygun başka bir güne taşıyacağım.",
            "needs": ["teacher", "day"],
        },

        {
            "templates": [
                "{cls}'nın ders programı bitti mi? Eğer eksikse kalan saatleri tamamla",
                "{cls} programı tam mı? Eksik varsa tamamla",
                "{cls}'nın çizelgesi bitmiş mi kontrol et, eksik dersleri ekle",
            ],
            "tool": "validateSchedule",
            "args": lambda v: {"class": v["cls"]},
            "reasoning": "Önce {cls} sınıfının programının tam olup olmadığını doğrulamam gerek, sonra eksik kalan saatleri tamamlayacağım.",
            "needs": ["cls"],
        },

        {
            "templates": [
                "İki {subject} öğretmeni var, az ders alanına {subject2} dersi ekle",
                "{subject} branşında iki hoca var, daha az yük alanına {subject2} ver",
                "İki {subject} hocasından az ders alanına {subject2} dersi koy",
            ],
            "tool": "getTeachersBySubject",
            "args": lambda v: {"subject": v["subject"]},
            "reasoning": "Önce {subject} dersini veren öğretmenleri ve ders yüklerini görmem gerek, sonra az ders alana {subject2} ekleyeceğim.",
            "needs": ["subject", "subject2"],
        },

        {
            "templates": [
                "{day} 8 ders var, hepsini 7'ye indir, sonra teneffüsü ekle",
                "{day} günü ders sayısı 8'den 7'ye düşsün, ardından mola koy",
                "{day} 8 saati 7 saate indirelim, teneffüs yerleştir",
            ],
            "tool": "getDayTimetable",
            "args": lambda v: {"day": v["day"]},
            "reasoning": "Önce {day} günü mevcut tüm derslerin yerleşimini görmem gerek, sonra 1 saati kaldırıp teneffüs slot'u yerleştireceğim.",
            "needs": ["day"],
        },

        {
            "templates": [
                "{subject} öğretmeni az ders alıyor, ona {cls}'da {subject} dersi ekle",
                "{subject} hocası boşta, {cls} sınıfına {subject} verelim",
                "{subject} öğretmeninin yükü düşük, {cls}'a {subject} dersi koy",
            ],
            "tool": "getTeachersBySubject",
            "args": lambda v: {"subject": v["subject"]},
            "reasoning": "Önce {subject} dersini veren öğretmenleri ve mevcut yüklerini görmem gerek, sonra {cls}'a {subject} dersi atayacağım.",
            "needs": ["subject", "cls"],
        },

        {
            "templates": [
                "{cls}'nın programını göster sonra {day} günü {subject} ekle",
                "{cls} çizelgesine bakalım, ardından {day}'a {subject} koyalım",
                "{cls}'ın haftalık programını çek, {day}'a {subject} ekle",
            ],
            "tool": "getClassTimetable",
            "args": lambda v: {"class": v["cls"]},
            "reasoning": "Önce {cls} sınıfının mevcut haftalık programını çekmem gerek, sonra {day} günü uygun saate {subject} dersini ekleyeceğim.",
            "needs": ["cls", "day", "subject"],
        },

        {
            "templates": [
                "{cls}'daki {subject} dersinin saatini değiştir",
                "{cls} {subject} dersinin yerini düzenle",
                "{cls}'ın {subject} aktivitesinin slotunu güncelle",
            ],
            "tool": "getActivityDetails",
            "args": lambda v: {"class": v["cls"], "subject": v["subject"]},
            "reasoning": "Önce {cls} sınıfındaki {subject} aktivitesinin mevcut bilgilerini görmem gerek, sonra slotunu güncelleyeceğim.",
            "needs": ["cls", "subject"],
        },

        {
            "templates": [
                "Sistemde kaç kısıtlama var? Çoksa hafif olanları gevşet",
                "Kısıtlama yoğunluğu fazla mı? Fazlaysa düşür",
                "Aktif kısıtlamaları say, gerekirse azalt",
            ],
            "tool": "countConstraints",
            "args": lambda v: {},
            "reasoning": "Önce aktif kısıtlama sayısını öğrenmem gerek, sonra çoksa zayıf ağırlıklı olanları gevşeteceğim.",
            "needs": [],
        },

        {
            "templates": [
                "Hangi gün daha boş? O güne {subject} dersi ekle",
                "En boş günü bul, oraya {subject} koy",
                "En az dolu güne {subject} dersi yerleştir",
            ],
            "tool": "getTimetableStats",
            "args": lambda v: {},
            "reasoning": "Önce gün bazlı doluluk istatistiklerine bakmam gerek, sonra en boş güne {subject} dersini ekleyeceğim.",
            "needs": ["subject"],
        },

        {
            "templates": [
                "{day} {hour}. ders kimde? Boşsa {subject} ekle",
                "{day} {hour}. saat kim var? Yoksa {subject} koy",
                "{day} {hour}. ders boş mu? {subject} dersi yerleştirilebilir mi?",
            ],
            "tool": "whoIsTeaching",
            "args": lambda v: {"day": v["day"], "hour": v["hour"]},
            "reasoning": "Önce {day} {hour}. derste kimin ders verdiğini öğrenmem gerek, sonra boşsa {subject} dersini ekleyeceğim.",
            "needs": ["day", "hour", "subject"],
        },
    ]
    for _ in range(n):
        scen = random.choice(SCENARIOS)

        ctx_extra_teachers = []
        ctx_extra_classes = []
        v = {}
        if "teacher" in scen["needs"]:
            v["teacher"] = random.choice(TEACHERS)
            ctx_extra_teachers.append(v["teacher"])
        if "cls" in scen["needs"]:
            cls_year = random.choice(["9", "10", "11", "12"])
            cls_letter = random.choice("ABCDEF")
            v["cls"] = f"{cls_year}{cls_letter}"
            ctx_extra_classes.append(v["cls"])
        if "subject" in scen["needs"]:
            v["subject"] = random.choice(SUBJECTS)
        if "subject2" in scen["needs"]:
            other = random.choice(SUBJECTS)
            while other == v.get("subject"):
                other = random.choice(SUBJECTS)
            v["subject2"] = other
        if "day" in scen["needs"]:
            v["day"] = random.choice(DAYS_FULL)
        if "room" in scen["needs"]:
            v["room"] = random.choice(["Lab1", "Lab2", "BT Sınıfı", "Müzik Sınıfı", "201", "302", "Konferans Salonu"])
        if "year" in scen["needs"]:
            v["year"] = random.choice(["9", "10", "11", "12"])
        if "hour" in scen["needs"]:
            v["hour"] = random.randint(1, 8)
        ctx = make_context(
            extra_teachers=ctx_extra_teachers or None,
            extra_classes=ctx_extra_classes or None,
        )
        if "room" in v and v["room"] not in ctx["rooms"]:
            ctx["rooms"].append(v["room"])
        if "subject" in v and v["subject"] not in ctx["subjects"]:
            ctx["subjects"].append(v["subject"])
        if "subject2" in v and v["subject2"] not in ctx["subjects"]:
            ctx["subjects"].append(v["subject2"])
        template = random.choice(scen["templates"])

        request = template.format(**{k: v.get(k, "") for k in ["cls", "subject", "subject2", "day", "teacher", "room", "year", "hour"]})
        args = scen["args"](v)
        reasoning = scen["reasoning"].format(**{k: v.get(k, "") for k in ["cls", "subject", "subject2", "day", "teacher", "room", "year", "hour"]})
        payload = _tool_call(scen["tool"], args, reasoning)
        out.append(example(ctx, request, payload))
    return out

def gen_out_of_scope(n: int) -> list[dict]:
    """
    Sistem dışı (out-of-scope) istekler — nazik red + capability listesi.
    """
    out = []
    REQUESTS = [

        "nasılsın?",
        "olm bişey anlatsana",
        "espri yap",
        "kim kazandı maç?",
        "yapay zekayla sohbet edelim",
        "bana motivasyon ver",
        "bir hikaye anlat",
        "bugün nasıl geçti?",

        "öğrencilerin notlarını göster",
        "Ahmet'in matematikten kaç aldığını söyle",
        "9A'nın devamsızlığını göster",
        "sınav programı oluştur",
        "anket yap",
        "öğrenci listesi getir",
        "veli toplantısı planla",
        "öğrenci başarı raporu çıkar",

        "öğretmen maaşları ne kadar?",
        "bordro hesapla",
        "okul masraflarını göster",
        "bütçe planla",
        "fatura ödeme listesi",

        "Ahmet hocaya mesaj at",
        "velilere email gönder",
        "SMS at tüm öğretmenlere",
        "WhatsApp grubu oluştur",
        "veli toplantısı bildir",
        "duyuru yaz öğretmenlere",

        "Google Calendar'a aktar",
        "Outlook'a sync et",
        "kişisel takvimime ekle",
        "iCal export yap",
        "Apple Calendar'a bağla",

        "Python kodu yaz",
        "İngilizce'ye çevir şu cümleyi",
        "şu metni özetle",
        "matematik problemi çöz",
        "react component yaz",
        "SQL sorgu yaz",
        "AI olarak kendini tanıt",
        "hangi modelsin sen?",
        "hangi versiyonu kullanıyorsun?",
        "OpenAI mi Anthropic mi?",

        "hava nasıl yarın?",
        "şu sayfayı tara ve özet ver",
        "PDF rapor üret",
        "öğretmen değerlendirme formu hazırla",
    ]
    ANSWERS = [
        "Bunu yapamam — ben sadece ders programı düzenliyorum. Şunları yapabilirim: kısıtlama ekle, öğretmen/sınıf/derslik ekle, program üret, slot kilitle, ders değiştir.",
        "Maalesef bu konuda yardımcı olamam. Görevim ders programı oluşturmak. İstersen 'Ahmet hoca cuma yok' gibi bir kısıtlama veya 'Lab1 dersliği ekle' gibi bir veri işlemi yapabilirim.",
        "Bu sistemin alanı dışında. Ders programı yönetimi yapıyorum: program üret, kısıtlama ekle, öğretmen düzenle, slot kilitle. Bunlardan biriyle yardımcı olabilirim.",
        "Bu konuda yardımcı olamam — sadece ders programı oluşturma/düzenleme yapıyorum. Kısıtlama, slot, öğretmen, sınıf, derslik işlemleri için buradayım.",
        "Üzgünüm, bu benim görev alanım değil. Ders programı üretimi, kısıtlama yönetimi, slot düzenleme ve veri girişi konularında yardım edebilirim.",
        "Bunu yapma yetkim yok — ben ders programı asistanıyım. Program üret, kısıtlama ekle, ders/öğretmen/derslik değiştir, çizelge sorgula gibi şeyler yapabilirim.",
        "Yapamam bunu. Ders programı oluşturucuyum: kısıtlama tanımla, FET solver çalıştır, slot kilitle, aktivite ekle/sil — bu konularda yardımcı olurum.",
        "Görev tanımım dışında. Yalnızca ders programı oluşturmak ve düzenlemek için tasarlandım. 'Programı üret', 'Lab1 derslik ekle' gibi taleplerle yardımcı olabilirim.",
    ]
    for _ in range(n):
        request = random.choice(REQUESTS)
        answer = random.choice(ANSWERS)
        ctx = make_context()
        payload = {
            "kind": "query",
            "answer": answer,
            "outOfScope": True,
            "confidence": round(random.uniform(0.92, 0.98), 2),
        }
        out.append(example(ctx, request, payload))
    return out

def gen_disambiguation(n: int) -> list[dict]:
    """
    Aynı isim 2+ kez geçtiğinde model needsClarification:true ile soru sorar.
    """
    out = []
    AMBIG_FIRST_NAMES = ["Ahmet", "Mehmet", "Ayşe", "Fatma", "Murat", "Ali", "Selin", "Emine", "Hasan", "Zeynep"]
    SURNAMES_A = ["Yılmaz", "Demir", "Kaya", "Aksoy", "Yıldız", "Arslan"]
    SURNAMES_B = ["Öztürk", "Çelik", "Şahin", "Polat", "Korkmaz", "Doğan", "Karaca", "Aydın"]

    def teacher_scenario():
        first = random.choice(AMBIG_FIRST_NAMES)
        t1 = f"{first} {random.choice(SURNAMES_A)}"
        t2_sur = random.choice(SURNAMES_B)
        t2 = f"{first} {t2_sur}"
        while t2 == t1:
            t2 = f"{first} {random.choice(SURNAMES_B)}"
        ctx = make_context(extra_teachers=[t1, t2])
        day = random.choice(DAYS_FULL)
        subject = random.choice(SUBJECTS)
        cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
        templates = [
            f"{first} hoca {day} yok",
            f"{first} öğretmen {day} müsait değil",
            f"{first} hoca az ders alıyor, ona {subject} dersi ekle",
            f"{first} hanım'a {cls}'da {subject} dersi ekle",
            f"{first} Bey'in saatlerini göster",
            f"{first} öğretmeni sil",
            f"{first} öğretmen {day} günü izinli",
            f"{first}'in programını ver",
            f"{first} hocaya {cls} sınıfında ders ata",
            f"{first} öğretmenin günlük max 4 ders olsun",
            f"{first} hoca ile {cls} sınıfı çakışmasın",
            f"{first}'in {day} dersleri başka güne taşınsın",
            f"{first} hocam {day} ilk derste olmasın",
            f"{first}'i {subject} branşına ata",
            f"{first} hoca son derste olmasın",
        ]
        request = random.choice(templates)
        answer_variants = [
            f"İki {first} var: '{t1}' ve '{t2}'. Hangisini kastediyorsunuz?",
            f"'{first}' isminde 2 öğretmen var — '{t1}' mı '{t2}' mi?",
            f"{first} olarak '{t1}' ve '{t2}' var. Hangisini kastettiniz?",
            f"İki tane {first} öğretmen mevcut: '{t1}' ve '{t2}'. Hangisi?",
            f"'{first}' adında iki hoca var: '{t1}' ve '{t2}'. Lütfen netleştirin.",
        ]
        payload = {
            "kind": "query",
            "answer": random.choice(answer_variants),
            "data": [{"option": t1}, {"option": t2}],
            "needsClarification": True,
            "confidence": round(random.uniform(0.35, 0.55), 2),
        }
        return ctx, request, payload

    def class_scenario():
        year = random.choice(["9", "10", "11"])
        letter = random.choice("ABC")
        c1 = f"{year}{letter}"
        c2 = f"{year}{letter}/Sosyal"
        ctx = make_context(extra_classes=[c1, c2])
        day = random.choice(DAYS_FULL)
        subject = random.choice(SUBJECTS)
        templates = [
            f"{c1} günde 8 ders alsın",
            f"{c1}'ye {subject} ekle",
            f"{c1}'nın programını göster",
            f"{c1} {day} 8 saat ders alsın",
            f"{c1}'da {subject} son derste olsun",
            f"{c1} {day} ilk derste boş olsun",
            f"{c1}'a {subject} dersi yerleştir",
            f"{c1}'nın {day} programı nasıl?",
        ]
        request = random.choice(templates)
        answer_variants = [
            f"İki '{c1}' var: '{c1}' ve '{c2}'. Hangisini kastediyorsunuz?",
            f"'{c1}' adında iki sınıf var — '{c1}' mı '{c2}' mi?",
            f"{c1} olarak '{c1}' ve '{c2}' mevcut. Hangisi?",
            f"İki tane {c1} sınıfı var: '{c1}' ve '{c2}'. Lütfen netleştirin.",
        ]
        payload = {
            "kind": "query",
            "answer": random.choice(answer_variants),
            "data": [{"option": c1}, {"option": c2}],
            "needsClarification": True,
            "confidence": round(random.uniform(0.35, 0.55), 2),
        }
        return ctx, request, payload

    def room_scenario():
        base = random.choice(["Lab1", "Salon", "Lab2", "Stüdyo"])
        suffix_a = random.choice(["Fizik", "Kimya", "Bilgisayar", "Biyoloji"])
        suffix_b = random.choice(["Bilgisayar", "Yabancı Dil", "Elektronik", "Müzik"])
        while suffix_a == suffix_b:
            suffix_b = random.choice(["Bilgisayar", "Yabancı Dil", "Elektronik", "Müzik"])
        r1 = f"{base} {suffix_a}"
        r2 = f"{base} {suffix_b}"
        ctx = make_context()
        if r1 not in ctx["rooms"]:
            ctx["rooms"].append(r1)
        if r2 not in ctx["rooms"]:
            ctx["rooms"].append(r2)
        day = random.choice(DAYS_FULL)
        templates = [
            f"{base} {day} yok",
            f"{base} dersliğine Fizik ekle",
            f"{base}'i sil",
            f"{base} {day} kapalı olsun",
            f"{base} dersliği müsait değil",
        ]
        request = random.choice(templates)
        answer_variants = [
            f"İki '{base}' var: '{r1}' ve '{r2}'. Hangisini kastediyorsunuz?",
            f"'{base}' adında iki derslik var — '{r1}' mı '{r2}' mi?",
            f"{base} olarak '{r1}' ve '{r2}' mevcut. Hangisi?",
        ]
        payload = {
            "kind": "query",
            "answer": random.choice(answer_variants),
            "data": [{"option": r1}, {"option": r2}],
            "needsClarification": True,
            "confidence": round(random.uniform(0.35, 0.55), 2),
        }
        return ctx, request, payload

    def subject_scenario():
        pairs = [
            ("Edebiyat", "Türk Edebiyatı", "Çağdaş Türk Edebiyatı"),
            ("Beden", "Beden Eğitimi", "Beden ve Sağlık"),
            ("Tarih", "Türk Tarihi", "Çağdaş Tarih"),
            ("Matematik", "Temel Matematik", "İleri Matematik"),
            ("Fizik", "Genel Fizik", "Uygulamalı Fizik"),
        ]
        short, s1, s2 = random.choice(pairs)
        ctx = make_context()
        if s1 not in ctx["subjects"]:
            ctx["subjects"].append(s1)
        if s2 not in ctx["subjects"]:
            ctx["subjects"].append(s2)
        cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
        templates = [
            f"{short} dersi son saatte olsun",
            f"{short} hocası kim?",
            f"{cls}'ye {short} dersi ekle",
            f"{short} dersi günde max 2 saat",
            f"{short} dersi ilk derste olmasın",
        ]
        request = random.choice(templates)
        answer_variants = [
            f"İki '{short}' dersi var: '{s1}' ve '{s2}'. Hangisini kastediyorsunuz?",
            f"'{short}' olarak '{s1}' ve '{s2}' var — hangisi?",
            f"{short} adında 2 branş mevcut: '{s1}' ve '{s2}'. Lütfen netleştirin.",
        ]
        payload = {
            "kind": "query",
            "answer": random.choice(answer_variants),
            "data": [{"option": s1}, {"option": s2}],
            "needsClarification": True,
            "confidence": round(random.uniform(0.35, 0.55), 2),
        }
        return ctx, request, payload

    for _ in range(n):
        r = random.random()
        if r < 0.50:
            ctx, request, payload = teacher_scenario()
        elif r < 0.75:
            ctx, request, payload = class_scenario()
        elif r < 0.87:
            ctx, request, payload = room_scenario()
        else:
            ctx, request, payload = subject_scenario()
        out.append(example(ctx, request, payload))
    return out

def gen_schedule_update(n: int) -> list[dict]:
    """Program İSKELETİ değişiklikleri (kind: schedule_update).

    Önceden hiç örnek yoktu — model 'teneffüsleri uzat', 'cumaya saat ekle',
    'günde 8 ders olsun' gibi iskelet taleplerini öğrenemiyordu. Buradaki 3
    aksiyon data_mutation op'larıyla çakışmaz (saat/teneffüs iskeleti).
    """
    out = []
    for i in range(n):
        ctx = make_context()
        D = ctx["days"]
        choice = i % 3
        if choice == 0:
            mins = random.choice([5, 10, 15, 5, 10, 20])
            request = random.choice([
                f"Teneffüsleri {mins} dakika uzat",
                f"Aralara {mins} dakika ekle",
                f"Teneffüs sürelerini {mins} dakika artır",
                f"Molalar {mins} dakika daha uzun olsun",
            ])
            payload = {
                "kind": "schedule_update",
                "action": "extend_breaks",
                "params": {"minutes": mins},
                "explanation": f"Teneffüs süreleri {mins} dakika uzatılacak. Onaylıyor musunuz?",
                "confidence": round(random.uniform(0.85, 0.95), 2),
            }
        elif choice == 1:
            day = random.choice(D)
            cnt = random.choice([1, 1, 2])
            request = random.choice([
                f"{day_phrase(day)} gününe {cnt} saat ekle",
                f"{day_phrase(day)} günü {cnt} ders saati daha olsun",
                f"{day_phrase(day)} biraz uzasın, {cnt} saat ekle",
            ])
            payload = {
                "kind": "schedule_update",
                "action": "add_hours_to_day",
                "params": {"day": day, "count": cnt},
                "explanation": f"{day} gününe {cnt} ders saati eklenecek. Onaylıyor musunuz?",
                "confidence": round(random.uniform(0.82, 0.93), 2),
            }
        else:
            hpd = random.choice([6, 7, 8, 9])
            request = random.choice([
                f"Günde {hpd} ders olsun",
                f"Her gün {hpd} saat olsun",
                f"Günlük ders saatini {hpd} yap",
                f"Tüm günler {hpd} saatlik olsun",
            ])
            payload = {
                "kind": "schedule_update",
                "action": "set_hours_per_day",
                "params": {"hoursPerDay": hpd},
                "explanation": f"Günlük ders saati {hpd} olarak ayarlanacak. Onaylıyor musunuz?",
                "confidence": round(random.uniform(0.85, 0.94), 2),
            }
        out.append(example(ctx, request, payload))
    return out



def format_tool_result(tool: str, args: dict, result) -> str:
    return (
        f"[TOOL_RESULT]\n"
        f"tool: {tool}\n"
        f"args: {json.dumps(args, ensure_ascii=False)}\n"
        f"result: {json.dumps(result, ensure_ascii=False)}\n"
        f"[/TOOL_RESULT]"
    )

def example_multiturn(ctx: dict, request: str, steps: list) -> dict:
    """steps: [(assistant_payload, tool_result | None), ...]
    Her adım bir assistant turu; tool_result None değilse araya bir
    [TOOL_RESULT] user mesajı girer. Son adımın tool_result'ı None olmalı
    (modelin nihai cevabı). En az 1 tool turu + 1 final tur içerir."""
    msgs = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": make_user_msg(ctx, request)},
    ]
    for payload, tool_result in steps:
        msgs.append({"role": "assistant", "content": make_assistant_msg(payload)})
        if tool_result is not None:
            msgs.append({
                "role": "user",
                "content": format_tool_result(payload["tool"], payload.get("args", {}), tool_result),
            })
    return {"messages": msgs}


def _sim_slot(ctx, cls, day, hour):
    """getTimetableSlot sonucu — %25 boş, gerisi dolu."""
    if random.random() < 0.25:
        return {"class": cls, "day": day, "hour": hour, "empty": True}
    return {
        "class": cls, "day": day, "hour": hour,
        "subject": random.choice(ctx["subjects"]),
        "teacher": random.choice(ctx["teachers"]),
        "room": random.choice(ctx["rooms"]),
    }

def _sim_teacher_tt(ctx, teacher):
    slots = []
    for d in ctx["days"]:
        for h in range(1, ctx["hoursPerDay"] + 1):
            if random.random() < 0.30:
                slots.append({"day": d, "hour": h, "class": random.choice(ctx["classes"]), "subject": random.choice(ctx["subjects"])})
    return {"teacher": teacher, "slots": slots, "totalHours": len(slots)}

def _sim_free_slots(ctx, who_key, who_val, k=None):
    free = []
    for d in ctx["days"]:
        for h in range(1, ctx["hoursPerDay"] + 1):
            if random.random() < 0.35:
                free.append({"day": d, "hour": h})
    if k:
        free = free[:k]
    return {who_key: who_val, "freeSlots": free}

def _sim_day_tt(ctx, day):
    rows = []
    for c in ctx["classes"]:
        for h in range(1, ctx["hoursPerDay"] + 1):
            if random.random() < 0.5:
                rows.append({"class": c, "hour": h, "subject": random.choice(ctx["subjects"]), "teacher": random.choice(ctx["teachers"])})
    return {"day": day, "rows": rows}

def _sim_who_teaching(ctx, day, hour):
    rows = []
    for c in random.sample(ctx["classes"], min(len(ctx["classes"]), random.randint(2, 5))):
        rows.append({"class": c, "subject": random.choice(ctx["subjects"]), "teacher": random.choice(ctx["teachers"])})
    return {"day": day, "hour": hour, "teaching": rows}

def _sim_teachers_by_subject(ctx, subject, n=2):
    pool = random.sample(ctx["teachers"], min(len(ctx["teachers"]), n))
    return {"subject": subject, "teachers": [{"teacher": t, "weeklyHours": random.randint(4, 26)} for t in pool]}

def _sim_count_constraints(ctx):
    active = len([c for c in ctx.get("constraints", []) if c.get("active", True)]) or random.randint(8, 40)
    return {"total": active + random.randint(0, 6), "active": active}

def _sim_validate(ctx, cls):
    missing = []
    if random.random() < 0.6:
        for _ in range(random.randint(1, 3)):
            missing.append({"class": cls, "subject": random.choice(ctx["subjects"]), "missingHours": random.randint(1, 3)})
    return {"class": cls, "complete": not missing, "missing": missing}


def _describe_constraint(c: dict) -> str:
    p = c.get("params", {})
    who = p.get("teacher") or p.get("class") or p.get("subject") or p.get("room") or ""
    base = c["type"].lower().replace("_", " ")
    mx = p.get("maxHours", p.get("maxDays"))
    parts = [who, base, f"({mx})" if mx is not None else ""]
    return " ".join(x for x in parts if x)

def make_existing_constraints(ctx: dict, k: int) -> list:
    """Context'e konacak MEVCUT kısıtlamalar — id/type/weight/active/description
    (app'in gönderdiği obje şekliyle aynı)."""
    out = []
    pool = [
        ("TEACHER_NOT_AVAILABLE", lambda: {"teacher": random.choice(ctx["teachers"]), "slots": [{"day": random.choice(ctx["days"]), "hour": random.randint(1, ctx["hoursPerDay"])}]}),
        ("TEACHER_MAX_HOURS_DAILY", lambda: {"teacher": random.choice(ctx["teachers"]), "maxHours": random.randint(4, 7)}),
        ("CLASS_NOT_FIRST_HOUR", lambda: {"class": random.choice(ctx["classes"])}),
        ("SUBJECT_NOT_ON_DAY", lambda: {"subject": random.choice(ctx["subjects"]), "class": None, "days": [random.choice(ctx["days"])]}),
        ("SUBJECT_LAST_HOUR_OF_DAY", lambda: {"subject": random.choice(ctx["subjects"]), "class": None}),
        ("TEACHER_MAX_DAYS_PER_WEEK", lambda: {"teacher": random.choice(ctx["teachers"]), "maxDays": random.randint(3, 5)}),
    ]
    for i in range(k):
        ctype, mk = random.choice(pool)
        params = mk()
        c = {
            "id": i + 1,
            "type": ctype,
            "weight": random.choice([60, 80, 100]),
            "active": random.random() > 0.2,
            "params": params,
        }
        c_ctx = {"id": c["id"], "type": ctype, "weight": c["weight"], "active": c["active"], "description": _describe_constraint(c)}
        out.append((c, c_ctx))
    return out


def gen_multi_turn_query(n: int) -> list[dict]:
    """Çok-turlu sorgu: tool_call → [TOOL_RESULT] → final query cevabı.
    Modele "tool sonucu geldikten sonra Türkçe cevap üret" davranışını öğretir."""
    out = []
    for _ in range(n):
        kind = random.random()
        if kind < 0.34:
            cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
            ctx = make_context(extra_classes=[cls])
            day = random.choice(ctx["days"]); hour = random.randint(1, ctx["hoursPerDay"])
            request = random.choice([
                f"{cls} {day} {hour}. ders kim?",
                f"{cls} {day} {hour}. saat hangi öğretmen?",
                f"{cls}'nın {day} {hour}. dersi ne?",
            ])
            res = _sim_slot(ctx, cls, day, hour)
            tc = _tool_call("getTimetableSlot", {"class": cls, "day": day, "hour": hour}, f"{cls} {day} {hour}. ders bilgisini çiziyorum.")
            if res.get("empty"):
                ans = f"{cls} sınıfının {day} günü {hour}. dersi boş görünüyor."
            else:
                ans = f"{cls} {day} {hour}. ders: {res['subject']} — {res['teacher']} ({res['room']})."
            final = {"kind": "query", "answer": ans, "data": [res], "confidence": round(random.uniform(0.9, 0.99), 2)}
        elif kind < 0.6:
            teacher = random.choice(TEACHERS)
            ctx = make_context(extra_teachers=[teacher])
            request = random.choice([
                f"{teacher} ne zaman ders veriyor?",
                f"{teacher.split()[0]} hocanın programını göster",
                f"{teacher} haftada kaç saat derse giriyor?",
            ])
            res = _sim_teacher_tt(ctx, teacher)
            tc = _tool_call("getTeacherTimetable", {"teacher": teacher}, f"{teacher} öğretmenin haftalık programını çekiyorum.")
            if res["slots"]:
                gunler = sorted({s["day"] for s in res["slots"]}, key=lambda d: ctx["days"].index(d))
                ans = f"{teacher} haftada toplam {res['totalHours']} saat derse giriyor ({', '.join(gunler)})."
            else:
                ans = f"{teacher} için programda henüz ders görünmüyor."
            final = {"kind": "query", "answer": ans, "data": res["slots"], "confidence": round(random.uniform(0.88, 0.98), 2)}
        elif kind < 0.8:
            ctx = make_context()
            day = random.choice(ctx["days"]); hour = random.randint(1, ctx["hoursPerDay"])
            request = random.choice([
                f"{day} {hour}. derste kimler ders veriyor?",
                f"{day} {hour}. saat kim nerede?",
            ])
            res = _sim_who_teaching(ctx, day, hour)
            tc = _tool_call("whoIsTeaching", {"day": day, "hour": hour}, f"{day} {hour}. derste kimin ders verdiğine bakıyorum.")
            ozet = "; ".join(f"{r['teacher']}→{r['class']} ({r['subject']})" for r in res["teaching"])
            final = {"kind": "query", "answer": f"{day} {hour}. derste: {ozet}.", "data": res["teaching"], "confidence": round(random.uniform(0.9, 0.98), 2)}
        else:
            ec = []
            ctx0 = make_context()
            pairs = make_existing_constraints(ctx0, random.randint(3, 8))
            ctx0["constraints"] = [p[1] for p in pairs]
            ctx = ctx0
            request = random.choice([
                "Kaç kısıtlama var?",
                "Sistemde toplam kaç kural tanımlı?",
                "Aktif kısıtlama sayısı nedir?",
            ])
            res = _sim_count_constraints(ctx)
            tc = _tool_call("countConstraints", {}, "Aktif kısıtlama sayısını çekiyorum.")
            final = {"kind": "query", "answer": f"Toplam {res['total']} kısıtlama var, {res['active']} tanesi aktif.", "data": [res], "confidence": round(random.uniform(0.92, 0.99), 2)}
        out.append(example_multiturn(ctx, request, [(tc, res), (final, None)]))
    return out


def gen_multi_turn_planning(n: int) -> list[dict]:
    """Çok-turlu planlama: keşif tool_call → [TOOL_RESULT] → data_mutation.
    Bazı senaryolar 2 tool turu (3 turlu) — MAX_TOOL_ITERATIONS=3 davranışı."""
    out = []
    for _ in range(n):
        branch = random.random()
        if branch < 0.4:
            teacher = random.choice(TEACHERS); subject = random.choice(SUBJECTS)
            cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
            ctx = make_context(extra_teachers=[teacher], extra_classes=[cls])
            if subject not in ctx["subjects"]:
                ctx["subjects"].append(subject)
            request = random.choice([
                f"{teacher} hocanın boş saatlerine {cls}'da {subject} dersi ekle",
                f"{teacher}'in müsait saatine {cls} {subject} koy",
            ])
            res = _sim_free_slots(ctx, "teacher", teacher)
            tc = _tool_call("getFreeSlots", {"teacher": teacher}, f"Önce {teacher} hocasının boş saatlerini bulmam gerek.")
            hrs = random.randint(1, 2)
            final = {
                "kind": "data_mutation",
                "actions": [{"op": "add_activity", "params": {"class": cls, "subject": subject, "teacher": teacher, "weeklyHours": hrs}, "description": f"{cls} sınıfına {subject} dersi ({hrs} saat, {teacher}) eklenecek."}],
                "explanation": f"{teacher} hocasının boş saatleri bulundu; {cls} {subject} dersi eklenecek.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.8, 0.93), 2),
            }
        elif branch < 0.7:
            subject = random.choice(SUBJECTS); cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
            ctx = make_context(extra_classes=[cls])
            if subject not in ctx["subjects"]:
                ctx["subjects"].append(subject)
            request = random.choice([
                f"{subject} branşında iki hoca var, az ders alanına {cls}'da {subject} ver",
                f"{subject} öğretmenlerinden yükü düşük olana {cls} {subject} dersi ekle",
            ])
            res = _sim_teachers_by_subject(ctx, subject, 2)
            for t in [x["teacher"] for x in res["teachers"]]:
                if t not in ctx["teachers"]:
                    ctx["teachers"].append(t)
            tc = _tool_call("getTeachersBySubject", {"subject": subject}, f"{subject} öğretmenlerini ve yüklerini görmem gerek.")
            az = min(res["teachers"], key=lambda x: x["weeklyHours"])["teacher"]
            final = {
                "kind": "data_mutation",
                "actions": [{"op": "add_activity", "params": {"class": cls, "subject": subject, "teacher": az, "weeklyHours": 2}, "description": f"{cls} sınıfına {subject} dersi (2 saat, {az}) eklenecek."}],
                "explanation": f"Yükü en düşük {subject} öğretmeni {az}; ders ona atanacak.",
                "requiresConfirmation": True,
                "confidence": round(random.uniform(0.78, 0.9), 2),
            }
        else:
            cls = f"{random.choice(['9','10','11','12'])}{random.choice('ABCDEF')}"
            ctx = make_context(extra_classes=[cls])
            request = random.choice([
                f"{cls}'nın programı tam mı? Eksikse tamamla",
                f"{cls} çizelgesi bitmiş mi kontrol et, eksik dersleri ekle",
            ])
            res = _sim_validate(ctx, cls)
            for m in res["missing"]:
                if m["subject"] not in ctx["subjects"]:
                    ctx["subjects"].append(m["subject"])
            tc = _tool_call("validateSchedule", {"class": cls}, f"Önce {cls} programının tamlığını doğrulamam gerek.")
            if res["complete"]:
                final = {"kind": "query", "answer": f"{cls} sınıfının programı tam görünüyor, eksik ders yok.", "confidence": round(random.uniform(0.9, 0.98), 2)}
            else:
                actions = [{"op": "add_activity", "params": {"class": cls, "subject": m["subject"], "weeklyHours": m["missingHours"]}, "description": f"{cls} sınıfına {m['subject']} dersi ({m['missingHours']} saat) eklenecek."} for m in res["missing"]]
                final = {"kind": "data_mutation", "actions": actions, "explanation": f"{cls} sınıfında {len(actions)} eksik ders tespit edildi; tamamlanacak.", "requiresConfirmation": True, "confidence": round(random.uniform(0.75, 0.88), 2)}
        out.append(example_multiturn(ctx, request, [(tc, res), (final, None)]))
    return out



def _data_mut(ctx, request, actions, explanation, conf=(0.85, 0.96)):
    payload = {
        "kind": "data_mutation",
        "actions": actions,
        "explanation": explanation,
        "requiresConfirmation": True,
        "confidence": round(random.uniform(*conf), 2),
    }
    return example(ctx, request, payload)

def gen_update_entities(n: int) -> list[dict]:
    """update_class / update_room / update_subject — mevcut kayıt güncelleme."""
    out = []
    for _ in range(n):
        r = random.random()
        ctx = make_context()
        if r < 0.4:
            cls = random.choice(ctx["classes"]); cnt = random.choice([24, 28, 30, 32, 36])
            request = random.choice([
                f"{cls}'nın mevcudunu {cnt} yap",
                f"{cls} sınıfının öğrenci sayısını {cnt} olarak güncelle",
                f"{cls}'da {cnt} öğrenci var, güncelle",
            ])
            actions = [{"op": "update_class", "params": {"name": cls, "studentCount": cnt}, "description": f"{cls} sınıfının mevcudu {cnt} yapılacak."}]
        elif r < 0.75:
            room = random.choice(ctx["rooms"]); cap = random.choice([20, 25, 30, 40]); bld = random.choice(["A Blok", "B Blok", "Ana Bina", "Ek Bina"])
            if random.random() < 0.5:
                request = random.choice([f"{room} dersliğinin kapasitesini {cap} yap", f"{room} kapasitesi {cap} olsun"])
                actions = [{"op": "update_room", "params": {"name": room, "capacity": cap}, "description": f"{room} dersliğinin kapasitesi {cap} yapılacak."}]
            else:
                request = random.choice([f"{room} dersliğini {bld}'a taşı", f"{room} {bld}'da olsun"])
                actions = [{"op": "update_room", "params": {"name": room, "building": bld}, "description": f"{room} dersliği {bld} olarak güncellenecek."}]
        else:
            subj = random.choice(ctx["subjects"]); code = "".join(w[0] for w in subj.split()[:3]).upper()
            request = random.choice([
                f"{subj} dersinin kısa kodunu {code} yap",
                f"{subj} branşının kodunu {code} olarak güncelle",
            ])
            actions = [{"op": "update_subject", "params": {"name": subj, "shortCode": code}, "description": f"{subj} dersinin kısa kodu {code} yapılacak."}]
        out.append(_data_mut(ctx, request, actions, actions[0]["description"]))
    return out

def gen_delete_activity(n: int) -> list[dict]:
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES); subj = random.choice(SUBJECTS)
        ctx = make_context(extra_classes=[cls])
        if subj not in ctx["subjects"]:
            ctx["subjects"].append(subj)
        request = random.choice([
            f"{cls}'dan {subj} dersini kaldır",
            f"{cls} sınıfının {subj} dersini sil",
            f"{cls}'da {subj} olmasın, dersi sil",
        ])
        actions = [{"op": "delete_activity", "params": {"class": cls, "subject": subj}, "description": f"{cls} sınıfının {subj} dersi (aktivitesi) silinecek. Onaylıyor musunuz?"}]
        out.append(_data_mut(ctx, request, actions, f"{cls} {subj} aktivitesi silinecek."))
    return out

def gen_class_year(n: int) -> list[dict]:
    """add_class_year / delete_class_year — kademe ekle/sil."""
    out = []
    for _ in range(n):
        ctx = make_context()
        yr = random.choice(["9. Sınıf", "10. Sınıf", "11. Sınıf", "12. Sınıf", "Hazırlık", "Anaokulu", "5. Sınıf", "6. Sınıf"])
        if random.random() < 0.6:
            request = random.choice([f"{yr} kademesi ekle", f"{yr} diye bir kademe oluştur", f"Yeni kademe: {yr}"])
            actions = [{"op": "add_class_year", "params": {"name": yr}, "description": f"'{yr}' kademesi eklenecek."}]
            expl = f"'{yr}' kademesi eklenecek."
        else:
            request = random.choice([f"{yr} kademesini sil", f"{yr} kademesini kaldır"])
            actions = [{"op": "delete_class_year", "params": {"name": yr}, "description": f"'{yr}' kademesi silinecek. Bağlı sınıflar etkilenebilir. Onaylıyor musunuz?"}]
            expl = f"'{yr}' kademesi silinecek."
        out.append(_data_mut(ctx, request, actions, expl))
    return out

def gen_hour_count(n: int) -> list[dict]:
    """add_hour / delete_hour — günlük ders saati sayısını değiştir."""
    out = []
    for _ in range(n):
        ctx = make_context()
        if random.random() < 0.55:
            request = random.choice([
                "Bir ders saati ekle", "Günlük saat sayısını 1 artır", "Bir saat daha ekle", "Ders saati ekle",
            ])
            actions = [{"op": "add_hour", "params": {}, "description": "Programa bir ders saati eklenecek."}]
            expl = "Bir ders saati eklenecek."
        else:
            request = random.choice([
                "Son ders saatini kaldır", "Bir ders saati sil", "Günlük saat sayısını 1 azalt", "Son saati çıkar",
            ])
            actions = [{"op": "delete_hour", "params": {}, "description": "Son ders saati silinecek."}]
            expl = "Bir ders saati silinecek."
        out.append(_data_mut(ctx, request, actions, expl))
    return out

def gen_constraint_manage(n: int) -> list[dict]:
    """delete_constraint / set_constraint_active — MEVCUT kısıtlama yönetimi.
    Context'e id'li kısıtlamalar konur; model id ile referans verir."""
    out = []
    for _ in range(n):
        ctx = make_context()
        pairs = make_existing_constraints(ctx, random.randint(3, 7))
        ctx["constraints"] = [p[1] for p in pairs]
        target = random.choice(ctx["constraints"])
        tid = target["id"]; desc = target["description"]
        r = random.random()
        if r < 0.45:
            request = random.choice([
                f"{tid} numaralı kısıtlamayı sil",
                f"{tid}. kuralı kaldır",
                f"'{desc}' kısıtlamasını sil",
            ])
            actions = [{"op": "delete_constraint", "params": {"constraintId": tid}, "description": f"{tid} numaralı kısıtlama ('{desc}') silinecek. Onaylıyor musunuz?"}]
            expl = f"{tid} numaralı kısıtlama silinecek."
        elif r < 0.75:
            request = random.choice([
                f"{tid} numaralı kısıtlamayı pasifleştir",
                f"{tid}. kuralı geçici kapat",
                f"'{desc}' kısıtlamasını devre dışı bırak",
            ])
            actions = [{"op": "set_constraint_active", "params": {"constraintId": tid, "active": False}, "description": f"{tid} numaralı kısıtlama ('{desc}') pasifleştirilecek."}]
            expl = f"{tid} numaralı kısıtlama pasifleştirilecek."
        else:
            request = random.choice([
                f"{tid} numaralı kısıtlamayı tekrar aktifleştir",
                f"{tid}. kuralı yeniden aç",
            ])
            actions = [{"op": "set_constraint_active", "params": {"constraintId": tid, "active": True}, "description": f"{tid} numaralı kısıtlama ('{desc}') aktifleştirilecek."}]
            expl = f"{tid} numaralı kısıtlama aktifleştirilecek."
        out.append(_data_mut(ctx, request, actions, expl))
    return out

def gen_two_activities_consecutive(n: int) -> list[dict]:
    """TWO_ACTIVITIES_CONSECUTIVE constraint — iki aktivite arka arkaya."""
    out = []
    for _ in range(n):
        ctx = make_context()
        a1 = random.randint(1, 60); a2 = a1 + random.randint(1, 20)
        request, w = apply_strength(random.choice([
            f"{a1} ve {a2} numaralı aktiviteler arka arkaya olsun",
            f"{a1}. aktivite ile {a2}. aktivite ardışık olsun",
            f"{a1} nolu ders bittikten hemen sonra {a2} nolu ders gelsin",
        ]), 80)
        payload = {
            "constraints": [{"type": "TWO_ACTIVITIES_CONSECUTIVE", "weight": w, "active": True, "params": {"firstActivityId": a1, "secondActivityId": a2}}],
            "confidence": round(random.uniform(0.8, 0.92), 2),
            "explanation": f"{a1} ve {a2} numaralı aktiviteler ardışık olacak şekilde kısıtlama eklendi.",
            "warnings": [], "unresolved": [],
        }
        out.append(example(ctx, request, payload))
    return out

def gen_clear_split(n: int) -> list[dict]:
    """clear_split — mevcut bölünmüş/birleşik grubu çöz."""
    out = []
    for _ in range(n):
        cls = random.choice(CLASSES)
        ctx = make_context(extra_classes=[cls])
        request = random.choice([
            f"{cls}'nın seçmeli grubunu ayır",
            f"{cls} bölünmüş dersini tek derse çevir",
            f"{cls}'daki grup dersini çöz, normale döndür",
            f"{cls}'nın split aktivitesini kaldır",
        ])
        actions = [{"op": "clear_split", "params": {"class": cls}, "description": f"{cls} sınıfının bölünmüş/grup aktivitesi çözülecek (normale dönecek)."}]
        out.append(_data_mut(ctx, request, actions, f"{cls} split grubu çözülecek."))
    return out

def gen_cancel_generation(n: int) -> list[dict]:
    """cancel_generation — süren program üretimini iptal et."""
    out = []
    for _ in range(n):
        ctx = make_context()
        request = random.choice([
            "Üretimi durdur", "Üretimi iptal et", "Çözümü durdur", "Programı üretmeyi bırak", "Dur, iptal et", "Solver'ı durdur",
        ])
        actions = [{"op": "cancel_generation", "params": {}, "description": "Süren program üretimi iptal edilecek."}]
        out.append(_data_mut(ctx, request, actions, "Program üretimi iptal edilecek.", conf=(0.9, 0.98)))
    return out


GENERATORS = {
    "teacher_not_available":      (gen_teacher_not_available, 250),
    "class_not_available":        (gen_class_not_available, 150),
    "subject_not_on_day":         (gen_subject_not_on_day, 200),
    "teacher_max_hours_daily":    (gen_teacher_max_hours_daily, 100),
    "teacher_max_days_per_week":  (gen_teacher_max_days_per_week, 100),
    "teacher_max_gaps_per_day":   (gen_teacher_max_gaps_per_day, 80),
    "teacher_max_gaps_per_week":  (gen_teacher_max_gaps_per_week, 80),
    "teachers_max_gaps_per_week": (gen_teachers_max_gaps_per_week, 60),
    "class_max_gaps_per_week":    (gen_class_max_gaps_per_week, 80),
    "subject_preferred_hours":    (gen_subject_preferred_hours, 150),
    "subject_last_hour":          (gen_subject_last_hour, 80),
    "subject_max_hours_daily":    (gen_subject_max_hours_daily, 100),
    "subject_consecutive":        (gen_subject_consecutive, 80),
    "room_not_available":         (gen_room_not_available, 80),
    "subject_preferred_room":     (gen_subject_preferred_room, 100),
    "teacher_home_room":          (gen_teacher_home_room, 60),
    "class_home_room":            (gen_class_home_room, 60),
    "combinations":               (gen_combinations, 200),
    "ambiguous":                  (gen_ambiguous, 150),
    "edge_cases":                 (gen_edge_cases, 150),
    "schedule_update":            (gen_schedule_update, 120),
    "teacher_min_hours_daily":                    (gen_teacher_min_hours_daily, 60),
    "teacher_not_available_interval":             (gen_teacher_not_available_interval, 80),
    "teacher_min_days_per_week":                  (gen_teacher_min_days_per_week, 60),
    "teacher_max_hours_continuously":             (gen_teacher_max_hours_continuously, 60),
    "teacher_max_building_changes_per_day":       (gen_teacher_max_building_changes_per_day, 50),
    "teacher_max_building_changes_per_week":      (gen_teacher_max_building_changes_per_week, 50),
    "teacher_min_gaps_between_building_changes":  (gen_teacher_min_gaps_between_building_changes, 50),
    "teacher_not_first_hour":                     (gen_teacher_not_first_hour, 60),
    "teacher_not_last_hour":                      (gen_teacher_not_last_hour, 60),
    "teacher_min_rest_between_days":              (gen_teacher_min_rest_between_days, 50),
    "class_max_hours_daily":                      (gen_class_max_hours_daily, 70),
    "class_min_hours_daily":                      (gen_class_min_hours_daily, 60),
    "class_max_gaps_per_day":                     (gen_class_max_gaps_per_day, 70),
    "class_early_max_beginnings":                 (gen_class_early_max_beginnings, 50),
    "class_max_building_changes_per_day":         (gen_class_max_building_changes_per_day, 50),
    "class_min_gaps_between_building_changes":    (gen_class_min_gaps_between_building_changes, 50),
    "class_not_first_hour":                       (gen_class_not_first_hour, 60),
    "class_max_hours_continuously":               (gen_class_max_hours_continuously, 60),
    "activity_fixed_time":                        (gen_activity_fixed_time, 70),
    "activities_same_starting_time":              (gen_activities_same_starting_time, 60),
    "activities_not_overlapping":                 (gen_activities_not_overlapping, 60),
    "activities_same_starting_day":               (gen_activities_same_starting_day, 50),
    "activity_ends_students_day":                 (gen_activity_ends_students_day, 50),
    "subject_not_first_hour":                     (gen_subject_not_first_hour, 70),
    "min_days_between_activities_custom":         (gen_min_days_between_activities_custom, 60),
    "min_gaps_between_activities":                (gen_min_gaps_between_activities, 50),
    "max_gaps_between_activities":                (gen_max_gaps_between_activities, 50),
    "activity_preferred_starting_times":          (gen_activity_preferred_starting_times, 60),
    "subject_preferred_rooms":                    (gen_subject_preferred_rooms, 70),
    "teacher_preferred_room":                     (gen_teacher_preferred_room, 60),
    "teacher_preferred_rooms":                    (gen_teacher_preferred_rooms, 50),
    "activity_preferred_room":                    (gen_activity_preferred_room, 60),
    "activity_preferred_rooms":                   (gen_activity_preferred_rooms, 50),
    "subject_activity_tag_preferred_room":        (gen_subject_activity_tag_preferred_room, 50),
    "activities_occupy_max_different_rooms":      (gen_activities_occupy_max_different_rooms, 50),
    "students_set_home_rooms":                    (gen_students_set_home_rooms, 60),
    "break_times":                                (gen_break_times, 60),
    "all_teachers_max_hours_daily":               (gen_all_teachers_max_hours_daily, 60),
    "all_teachers_max_days_per_week":             (gen_all_teachers_max_days_per_week, 50),
    "students_max_gaps_per_week":                 (gen_students_max_gaps_per_week, 60),
    "students_early_max_beginnings":              (gen_students_early_max_beginnings, 50),
    "students_max_hours_daily":                   (gen_students_max_hours_daily, 60),
    "max_total_activities_from_set":              (gen_max_total_activities_from_set, 50),
    "data_mutations":                             (gen_data_mutations, 200),

    "run_solver":                                 (gen_run_solver, 250),
    "per_class_subject_room":                     (gen_per_class_subject_room, 250),
    "constraint_relax":                           (gen_constraint_relax, 200),
    "set_setting":                                (gen_set_setting, 100),
    "generic_add_constraint":                     (gen_generic_add_constraint, 150),

    "split_activities":                           (gen_split_activities, 150),
    "set_timetable_slot":                         (gen_set_timetable_slot, 100),
    "lock_unlock_slot":                           (gen_lock_unlock_slot, 80),
    "substitute_teacher":                         (gen_substitute_teacher, 120),
    "merge_activities":                           (gen_merge_activities, 80),
    "export_timetable":                           (gen_export_timetable, 80),
    "validate_schedule":                          (gen_validate_schedule, 60),
    "timetable_stats":                            (gen_timetable_stats, 60),

    "timetable_query":                            (gen_timetable_query, 300),
    "filtered_activity_update":                   (gen_filtered_activity_update, 150),
    "filtered_activity_add":                      (gen_filtered_activity_add, 100),

    "slot_swap":                                  (gen_slot_swap, 120),
    "pair_subjects_consecutive":                  (gen_pair_subjects_consecutive, 100),
    "subject_spread_days":                        (gen_subject_spread_days, 80),
    "page_navigation":                            (gen_page_navigation, 60),

    "multi_step_planning":                        (gen_multi_step_planning, 100),
    "out_of_scope":                               (gen_out_of_scope, 120),
    "disambiguation":                             (gen_disambiguation, 100),

    "multi_turn_query":                           (gen_multi_turn_query, 220),
    "multi_turn_planning":                        (gen_multi_turn_planning, 180),

    "update_entities":                            (gen_update_entities, 150),
    "delete_activity":                            (gen_delete_activity, 90),
    "class_year":                                 (gen_class_year, 90),
    "hour_count":                                 (gen_hour_count, 80),
    "constraint_manage":                          (gen_constraint_manage, 150),
    "two_activities_consecutive":                 (gen_two_activities_consecutive, 70),
    "clear_split":                                (gen_clear_split, 70),
    "cancel_generation":                          (gen_cancel_generation, 60),
}

SCALE = int(os.environ.get("DPO_DATASET_SCALE", "22"))
TARGET_MIN = int(os.environ.get("DPO_DATASET_TARGET_MIN", "2000"))
TARGET_MAX = int(os.environ.get("DPO_DATASET_TARGET_MAX", "4000"))

def compute_count(base_count: int) -> int:
    """Per-generator adaptif scale: küçükleri yükselt, büyükleri düşür.

    Kategori dengesizliğini azaltmak için tek bir global SCALE yerine
    her generator'ın final örnek sayısını [TARGET_MIN, TARGET_MAX]
    aralığına clamp ediyoruz. Bu sayede max:min oranı ~3:1'in altına
    iniyor (önceden 6600:1100 gibi 6:1+ oranlar vardı).

    SCALE env var backward-compat amacıyla korunuyor: naive = base * SCALE,
    sonra [TARGET_MIN, TARGET_MAX] aralığına clamp.
    """
    naive = base_count * SCALE
    if naive < TARGET_MIN:
        return TARGET_MIN
    if naive > TARGET_MAX:
        return TARGET_MAX
    return naive

_NAME_TOKENS = None
def _name_tokens():
    global _NAME_TOKENS
    if _NAME_TOKENS is None:
        toks = set()
        for pool in (TEACHERS, CLASSES, SUBJECTS, ROOMS):
            for x in pool:
                toks.add(x)
                if " " in x:
                    toks.add(x.split()[0])
        _NAME_TOKENS = sorted(toks, key=len, reverse=True)
    return _NAME_TOKENS

def request_signature(line: str) -> tuple:
    """(kind, maskelenmiş_ilk_user_request) — leakage-free gruplama anahtarı."""
    obj = json.loads(line)
    user = next((m["content"] for m in obj["messages"] if m["role"] == "user"), "")
    m = re.search(r"\[USER_REQUEST\]\s*(.*?)\s*\[/USER_REQUEST\]", user, re.S)
    sig = m.group(1) if m else user
    for name in _name_tokens():
        if name in sig:
            sig = sig.replace(name, "§")
    sig = re.sub(r"\d+", "#", sig)
    sig = re.sub(r"\s+", " ", sig).strip().lower()
    asst = [mm["content"] for mm in obj["messages"] if mm["role"] == "assistant"]
    try:
        kind = json.loads(asst[-1]).get("kind", "constraint") if asst else "?"
    except Exception:
        kind = "?"
    return (kind, sig)

def main():
    total = 0
    for old in DS.glob("*.jsonl"):
        if old.stem not in GENERATORS:
            old.unlink()
            print(f"  ✗ bayat dosya silindi: {old.name}")
    for name, (gen, n) in GENERATORS.items():
        examples = gen(compute_count(n))
        path = DS / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for ex in examples:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
        print(f"  ✓ {name:32s} {len(examples):>5} örnek")
        total += len(examples)

    print(f"\nToplam: {total} örnek üretildi.")

    from collections import defaultdict

    seen_full = set()
    cat_groups = defaultdict(lambda: defaultdict(list))
    dup = 0
    for name in GENERATORS:
        with (DS / f"{name}.jsonl").open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if line in seen_full:
                    dup += 1
                    continue
                seen_full.add(line)
                sig = request_signature(line)
                cat_groups[name][sig].append(line)

    train, evals = [], []
    EVAL_FRAC = 0.12
    for name, groups in cat_groups.items():
        sigs = list(groups.keys())
        random.shuffle(sigs)
        n_eval = int(len(sigs) * EVAL_FRAC) if len(sigs) > 1 else 0
        eval_sigs = set(sigs[:n_eval])
        for sig, lines in groups.items():
            (evals if sig in eval_sigs else train).extend(lines)

    random.shuffle(train)
    random.shuffle(evals)

    split_dir = DS / "train_test_split"
    split_dir.mkdir(exist_ok=True)
    with (split_dir / "train.jsonl").open("w", encoding="utf-8") as f:
        for line in train:
            f.write(line + "\n")
    with (split_dir / "eval.jsonl").open("w", encoding="utf-8") as f:
        for line in evals:
            f.write(line + "\n")
    print(f"\nDedup ile atılan exact-duplicate: {dup}")
    print(f"Train: {len(train)} örnek → {split_dir / 'train.jsonl'}")
    print(f"Eval:  {len(evals)} örnek → {split_dir / 'eval.jsonl'}")

    train_sigs = {request_signature(l) for l in train}
    eval_sigs = {request_signature(l) for l in evals}
    overlap = train_sigs & eval_sigs
    leak = len(overlap) / max(len(eval_sigs), 1) * 100
    print(f"İmza sızıntısı (eval∩train / eval): {len(overlap)}/{len(eval_sigs)} = %{leak:.2f}")

if __name__ == "__main__":
    main()
