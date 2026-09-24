"""Generates the FB2 samples in samples/ (original text, no third-party content).

    python scripts/make-fb2-samples.py
"""
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def fb2(encoding, lang, title, author, chapters, notes):
    first, last = author
    sections = "\n".join(
        f"<section><title><p>{escape(name)}</p></title>\n"
        + "\n".join(f"<p>{p}</p>" for p in paragraphs)
        + "</section>"
        for name, paragraphs in chapters
    )
    note_sections = "\n".join(
        f'<section id="{nid}"><title><p>{i}</p></title><p>{escape(text)}</p></section>'
        for i, (nid, text) in enumerate(notes, 1)
    )
    return f"""<?xml version="1.0" encoding="{encoding}"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
<author><first-name>{first}</first-name><last-name>{last}</last-name></author>
<book-title>{escape(title)}</book-title>
<lang>{lang}</lang>
</title-info>
<document-info><program-used>make-fb2-samples.py</program-used><version>1.0</version></document-info>
</description>
<body>
<title><p>{escape(title)}</p></title>
{sections}
</body>
<body name="notes">
<title><p>Notes</p></title>
{note_sections}
</body>
</FictionBook>
"""


def note(nid, n):
    return f'<a l:href="#{nid}" type="note">[{n}]</a>'


UK_PARAGRAPHS = [
    "Ранок у містечку починався з дзвону на старій вежі. Ґрунтова дорога ще парувала після нічного дощу, "
    "а з пекарні на розі вже пахло свіжим хлібом і кмином.",
    "Їжак, що жив під ґанком бібліотеки, щоранку виходив подивитися на перехожих. Його знали всі діти, "
    "і кожен вважав своїм обов'язком принести йому яблуко чи грушу.",
    "Бібліотекарка Євгенія відчиняла двері рівно о дев'ятій. Вона казала, що книжки не люблять поспіху, "
    "а читачі — зачинених дверей.",
    "Над річкою стелився туман, і човни здавалися пташками, що задрімали на воді. Хтось на тому березі "
    "співав пісню, слів якої ніхто вже не пам'ятав.",
    "Увечері на площі збиралися сусіди: говорили про погоду, ціни на ярмарку і про те, що цього року "
    "вишні вродили, як ніколи раніше.",
]


def uk_sample():
    chapters = []
    for c, name in enumerate(["Ранок", "Бібліотека", "Вечір над річкою"], 1):
        paragraphs = [escape(p) for p in UK_PARAGRAPHS * 4]
        if c == 1:
            paragraphs[0] += " " + note("n1", 1)
        if c == 2:
            paragraphs[2] += " " + note("n2", 2)
        chapters.append((f"Розділ {c}. {name}", paragraphs))
    notes = [
        ("n1", "Вежу збудували ще до того, як містечко отримало свою назву."),
        ("n2", "Євгенія працювала в бібліотеці сорок років і знала напам'ять розташування кожної полиці."),
    ]
    return fb2("windows-1251", "uk", "Зразок: Містечко над річкою", ("Тестовий", "Автор"), chapters, notes)


EN_PARAGRAPHS = [
    "The lighthouse keeper wrote one line in the logbook every evening, whatever the weather.",
    "On calm nights the line was short. On stormy nights it was still one line, only written more firmly.",
    "Ships passed without knowing his name, and he preferred it that way.",
]


def en_sample():
    chapters = []
    for c, name in enumerate(["The Logbook", "The Storm"], 1):
        paragraphs = [escape(p) for p in EN_PARAGRAPHS * 6]
        if c == 1:
            paragraphs[1] += " " + note("n1", 1)
        chapters.append((f"Chapter {c}. {name}", paragraphs))
    notes = [("n1", "The logbook is kept in the museum by the harbour.")]
    return fb2("utf-8", "en", "Sample: The Lighthouse", ("Sample", "Author"), chapters, notes)


if __name__ == "__main__":
    (SAMPLES / "sample-windows-1251.fb2").write_bytes(uk_sample().encode("cp1251"))
    with zipfile.ZipFile(SAMPLES / "sample-utf8.fb2.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("sample-utf8.fb2", en_sample().encode("utf-8"))
    print("written to", SAMPLES)
