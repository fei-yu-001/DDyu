import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else r'd:/work/amaze/DDyu/data/media-check/upstream-v0.txt'
text = open(path, 'rb').read().decode('utf-8', 'replace')
print('bytes', len(text))
print('##### streamingVideoGenerationResponse #####')
for i, m in enumerate(re.finditer('streamingVideoGenerationResponse', text)):
    seg = text[m.start():m.start() + 420]
    print(f'--- #{i} ---')
    print(seg)
    print()
print('##### lines #####')
for i, line in enumerate(text.splitlines()):
    print(f'===== line {i} len={len(line)} =====')
    print(line)
