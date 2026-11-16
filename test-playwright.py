# Playwright play-test for EMBERLINE (Python). Serves game/ separately.
# 1) loads the menu, checks WebGL2 + zero console errors
# 2) clicks DEPLOY, walks and fires, checks the HUD
# 3) captures the four ?shot= demo frames as screenshots/*.jpg
import os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8901'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots')
errors = []
failed = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox', '--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

    page.goto(BASE + '/', wait_until='load')
    webgl2 = page.evaluate("() => !!document.createElement('canvas').getContext('webgl2')")
    print('webgl2:', webgl2)
    if not webgl2:
        failed.append('no WebGL2')
    page.wait_for_timeout(1500)
    print('menu visible:', page.evaluate("!document.getElementById('menu').classList.contains('hidden')"))

    page.click('#deployBtn')
    page.wait_for_timeout(500)
    print('hud visible after deploy:', page.evaluate("!document.getElementById('hud').classList.contains('hidden')"))
    page.keyboard.down('w')
    page.wait_for_timeout(1500)
    page.keyboard.up('w')
    page.mouse.click(640, 360)
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(OUT, '0-playtest.jpg'), type='jpeg', quality=82)
    print('after move+fire:', page.evaluate("""() => ({
        hp: document.getElementById('hpVal')?.textContent,
        timer: document.getElementById('timer')?.textContent,
        phase: document.getElementById('phaseLabel')?.textContent })"""))

    names = {1: '1-buy.jpg', 2: '2-fight.jpg', 3: '3-plant.jpg', 4: '4-win.jpg'}
    for n in (1, 2, 3, 4):
        page.goto(f'{BASE}/?shot={n}', wait_until='load')
        page.wait_for_timeout(2500)
        path = os.path.join(OUT, names[n])
        page.screenshot(path=path, type='jpeg', quality=82)
        size = os.path.getsize(path)
        print(f'shot {n}: {names[n]} {size} bytes', 'OK' if size <= 262144 else 'TOO BIG')
        if size > 262144:
            failed.append(f'{names[n]} over 256 KiB')
    print('0-playtest.jpg', os.path.getsize(os.path.join(OUT, '0-playtest.jpg')), 'bytes')
    browser.close()

print('console/page errors:', errors if errors else 'none')
failed += errors[:5]
if failed:
    print('FAILED:', failed)
    raise SystemExit(1)
print('PLAYWRIGHT OK')
