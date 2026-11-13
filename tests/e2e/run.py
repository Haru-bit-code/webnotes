"""Run every browser test suite against the app at WEBNOTES_URL (default http://localhost:3190).

    npm run build && npx next start -p 3190 &
    pip install playwright python-docx openpyxl pypdf && python -m playwright install chromium
    python tests/e2e/run.py              # all suites
    python tests/e2e/run.py two_tabs     # just some

Exits with 1 if any check fails or a suite crashes.
"""
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SUITES = ["walkthrough", "templates", "write_on_templates", "imports", "overlay", "note_types", "colours",
          "themes", "folders", "transfer", "two_tabs", "backup_restore", "ai_privacy", "web_pictures", "security_policy", "phone",
          "fill_templates"]

def main(names):
    total_pass = total_fail = 0; broken = []
    for name in names:
        t0 = time.time()
        r = subprocess.run([sys.executable, os.path.join(HERE, name + ".py")], cwd=HERE, capture_output=True, text=True, timeout=1500)
        lines = r.stdout.splitlines()
        p = sum(l.startswith("PASS") for l in lines); f = [l for l in lines if l.startswith("FAIL")]
        total_pass += p; total_fail += len(f)
        status = "ok" if r.returncode == 0 and not f else "FAILED"
        print(f"{status:7} {name:20} {p:3} passed, {len(f)} failed  ({time.time() - t0:.0f}s)")
        for l in f: print("        " + l)
        if r.returncode != 0:
            broken.append(name); print("        crashed:\n" + "\n".join("        " + l for l in r.stderr.strip().splitlines()[-6:]))
    print(f"\n{total_pass} checks passed, {total_fail} failed, {len(broken)} suite(s) crashed")
    return 1 if total_fail or broken else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or SUITES))
