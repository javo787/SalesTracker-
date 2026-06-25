import sys

def check_balance(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()

    tags = []
    for line_num, line in enumerate(lines, 1):
        content = line.strip()
        i = 0
        while i < len(line):
            if line[i:i+2] == '</':
                end = line.find('>', i)
                if end == -1: break
                tag = line[i+2:end].split()[0]
                if not tags:
                    print(f"Extra closing tag: {tag} at line {line_num}")
                else:
                    last = tags.pop()
                    if last != tag:
                        print(f"Mismatched tags: open {last}, close {tag} at line {line_num}")
                i = end + 1
            elif line[i] == '<' and i+1 < len(line) and line[i+1] not in ('!', '/', ' '):
                end = line.find('>', i)
                if end == -1: break
                if line[end-1] == '/': # Self-closing
                    pass
                else:
                    tag = line[i+1:end].split()[0]
                    # Filter out non-JSX
                    if (tag.isidentifier() or '.' in tag) and not tag in ('any[]', 'any', 'number', 'string', 'boolean'):
                        tags.append(tag)
                i = end + 1
            else:
                i += 1

    if tags:
        print(f"Unclosed tags: {tags}")
    else:
        print("All tags balanced (roughly)")

check_balance('src/screens/DebtorsScreen.tsx')
