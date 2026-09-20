"""Regression checks for final-response-only completion detection."""
from pathlib import Path
import subprocess
import tempfile

checker = Path(__file__).with_name('check-completion.sh').resolve()
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    log = root / 'combined.log'
    log.write_text('user\nFinish with <promise>COMPLETE</promise>\n')
    reply = root / 'last-message.txt'
    cases = [
        ('missing final response', None, False),
        ('empty final response', '', False),
        ('incomplete response', 'Blocked: missing dependency.', False),
        ('quoted instruction', 'The prompt says <promise>COMPLETE</promise>.', False),
        ('actual completion', 'Checks passed.\n<promise>COMPLETE</promise>\n', True),
    ]
    for name, body, expected in cases:
        if body is not None:
            reply.write_text(body)
        actual = subprocess.run([str(checker), str(reply)], check=False).returncode == 0
        assert actual == expected, name
        print('PASS:', name)
