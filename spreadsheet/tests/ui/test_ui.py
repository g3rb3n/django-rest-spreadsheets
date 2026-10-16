import pytest
from playwright.sync_api import expect, sync_playwright


def open_model(page, model):
    page.click(f'.sheet-tabs [data-class={model}]')
    expect(page.locator(f'.sheet-tabs [data-class={model}]')).to_have_class('active')
    return page.locator(f'table[data-class={model}]')


def row_action(row, action):
    """Pick an action from the row's right-click menu, as in Google Sheets."""
    row.locator('td').nth(1).click(button='right')
    row.page.click(f'.context-menu [data-action={action}]')


def log_in(page, username, password):
    page.click('.avatar-button')
    page.click('.user-menu-panel .menu-action')
    page.fill('dialog [name=username]', username)
    page.fill('dialog [name=password]', password)
    page.click('dialog button.primary')
    expect(page.locator('dialog.auth-dialog')).to_have_count(0)


@pytest.mark.django_db
def test_create(live_server, admin_user):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(live_server.url)

        # Anonymous users may look, not create.
        table = open_model(page, 'Variety')
        expect(table.locator('tr[data-action=create]')).to_have_count(0)

        log_in(page, admin_user.username, 'password')
        expect(page.locator('.avatar-button .avatar')).to_have_text(admin_user.username[0].upper())

        # Logging in reloads the schema and reopens the open table, now with
        # the create row; wait for that instead of racing it.
        new_item = table.locator('tr[data-action=create]')
        expect(new_item).to_have_count(1)
        rows = table.locator('tr.row')
        expect(rows).to_have_count(0)
        new_item.locator('[name=name]').fill('Japanese Wineberry')
        row_action(new_item, 'create')
        expect(rows).to_have_count(1)
        expect(rows.locator('[name=name]')).to_have_value('Japanese Wineberry')

        table = open_model(page, 'Plant')
        rows = table.locator('tr.row')
        expect(rows).to_have_count(0)
        new_item = table.locator('tr[data-action=create]')
        new_item.locator('[name=date_planted]').fill('2025-03-21')
        page.keyboard.press('Escape')  # close the date picker
        new_item.locator('[name=place]').fill('Garden')
        new_item.locator('[name=variety]').select_option(label='Japanese Wineberry')
        # Enter in the new-item row adds it too.
        new_item.locator('[name=place]').press('Enter')
        expect(rows).to_have_count(1)
        expect(rows.locator('[name=place]')).to_have_value('Garden')
        expect(rows.locator('[name=variety] option:checked')).to_have_text('Japanese Wineberry')
        expect(page.locator('.messages .message')).to_have_count(0)

        browser.close()
