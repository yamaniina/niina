import json
import re
from pathlib import Path

RAW_PATH = Path('raw_data.txt')
POEMS_JSON_PATH = Path('poems.json')

# Hard-coded overrides for newly published audio files. These take precedence over
# anything already present in poems.json so freshly added URLs are retained even
# after regeneration.
AUDIO_OVERRIDES = {
    "022": "https://fastjyoto.sharepoint.com/:u:/s/msteams_4f00e7/IQCcqSSnYpz6QbFCiAZkwCdeAXrT20uPTiAEc8m4K_PIS20?e=QEJsFu",
}


def parse_lines(raw_text):
    poems = []
    warnings = []
    for idx, raw_line in enumerate(raw_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        tokens = re.split(r"\s+", line)
        if len(tokens) < 5:
            warnings.append((idx, raw_line))
            tokens = (tokens + [""] * 5)[:5]
        kami_tokens = tokens[:3]
        shimo_tokens = tokens[3:5]
        poem_id = f"{len(poems)+1:03d}"
        poems.append({
            'id': poem_id,
            'kami_tokens': kami_tokens,
            'shimo_tokens': shimo_tokens,
        })
    return poems, warnings


def compute_kimariji(poems):
    joined = [''.join(p['kami_tokens']) for p in poems]
    for i, poem in enumerate(poems):
        base = joined[i]
        length = 6
        for n in range(1, 7):
            prefix = base[:n]
            collision = any(j != i and joined[j].startswith(prefix) for j in range(len(poems)))
            if not collision:
                length = n
                break
        poem['kimariji_len'] = length
        poem['kimariji'] = base[:length]


def build_records(poems):
    records = []
    for poem in poems:
        kami_kana = ' '.join(poem['kami_tokens'])
        shimo_kana = ' '.join(poem['shimo_tokens'])
        records.append({
            'id': poem['id'],
            'kami_kana': kami_kana,
            'shimo_kana': shimo_kana,
            'kimariji_len': poem['kimariji_len'],
            'kimariji': poem['kimariji'],
        })
    return records


def load_existing_audio_map(path: Path):
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}
    mapping = {}
    for item in data:
        audio = item.get('audio_url') or item.get('audio') or item.get('audioUrl')
        if audio:
            mapping[item.get('id')] = audio
    return mapping


def write_tsv(path, records):
    header = ['id', 'kimariji_len', 'kimariji', 'kami_kana', 'shimo_kana']
    lines = ['\t'.join(header)]
    for r in records:
        lines.append('\t'.join([
            r['id'],
            str(r['kimariji_len']),
            r['kimariji'],
            r['kami_kana'],
            r['shimo_kana'],
        ]))
    path.write_text('\n'.join(lines), encoding='utf-8')


def write_poems_json(path, records, audio_map):
    data = [
        {
            'id': 'JYO',
            'type': 'joka',
            'title': '序歌',
            'text': 'ナニワヅニ サクヤコノハナ フユゴモリ イマヲハルベト サクヤコノハナ',
            'kimariji_len': 0,
        }
    ]
    for r in records:
        audio = audio_map.get(r['id'])
        base = {
            'id': r['id'],
            'type': 'poem',
            'kami_kana': r['kami_kana'],
            'shimo_kana': r['shimo_kana'],
            'kami': r['kami_kana'],
            'shimo': r['shimo_kana'],
            'kimariji_len': r['kimariji_len'],
            'kimariji': r['kimariji'],
        }
        if audio:
            base['audio_url'] = audio
            base['audio'] = audio
        data.append(base)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    raw_text = RAW_PATH.read_text(encoding='utf-8')
    poems, warnings = parse_lines(raw_text)
    if warnings:
        for line_no, content in warnings:
            print(f"Warning: line {line_no} has fewer than 5 tokens: {content}")
    compute_kimariji(poems)
    records = build_records(poems)
    existing_audio = load_existing_audio_map(POEMS_JSON_PATH)
    existing_audio.update(AUDIO_OVERRIDES)
    write_tsv(Path('output.tsv'), records)
    write_poems_json(Path('poems.json'), records, existing_audio)
    print(f"Processed {len(records)} poems")


if __name__ == '__main__':
    main()
