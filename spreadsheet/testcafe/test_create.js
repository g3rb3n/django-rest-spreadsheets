import { Role, Selector } from 'testcafe';

// Run against a server with a superuser, e.g. `make run-background` after
// `make setup`; the Makefile passes the credentials from config.mk.
const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/';
const USERNAME = process.env.DJANGO_SUPERUSER_USERNAME || 'admin';
const PASSWORD = process.env.DJANGO_SUPERUSER_PASSWORD;

const admin = Role(BASE_URL, async t => {
    await t
        .click('.avatar-button')
        .click('.user-menu-panel .menu-action')
        .typeText('dialog [name=username]', USERNAME)
        .typeText('dialog [name=password]', PASSWORD)
        .click('dialog button.primary')
        .expect(Selector('.avatar-button .avatar.anonymous').exists).notOk();
}, { preserveUrl: true });

// Unique names, so the tests only ever touch records they created.
const unique = label => `${label} ${Date.now()}`;

const table = model => Selector(`table[data-class=${model}]`);
const newItem = model => table(model).find('tr[data-action=create]');
const rows = model => table(model).find('tr.row');
const rowWith = (model, field, value) => rows(model)
    .filter(tr => tr.querySelector(`[name=${field}]`).value === value, { field, value });
const errors = Selector('.messages .message');
const contextMenu = Selector('.context-menu');

// Pick an action from the row's right-click menu, as in Google Sheets.
async function rowAction(t, row, action) {
    await t
        .rightClick(row.find('td').nth(1))
        .click(contextMenu.find(`[data-action=${action}]`));
}

async function openModel(t, model) {
    const tab = Selector('.sheet-tabs li').withAttribute('data-class', model);
    await t
        .click(tab)
        .expect(tab.hasClass('active')).ok()
        .expect(table(model).exists).ok();
}

async function createVariety(t, name) {
    await openModel(t, 'Variety');
    await t.typeText(newItem('Variety').find('[name=name]'), name);
    await rowAction(t, newItem('Variety'), 'create');
    await t.expect(rowWith('Variety', 'name', name).exists).ok();
}

async function deleteVariety(t, name) {
    await openModel(t, 'Variety');
    await rowAction(t, rowWith('Variety', 'name', name), 'delete');
    await t.expect(rowWith('Variety', 'name', name).exists).notOk();
}

fixture`Spreadsheet`
    .page(BASE_URL)
    .before(() => {
        if (!PASSWORD)
            throw new Error('Set DJANGO_SUPERUSER_PASSWORD (make test-cafe takes it from config.mk)');
    });

test('Anonymous visitors get a read-only table', async t => {
    await openModel(t, 'Variety');
    await t
        .expect(newItem('Variety').exists).notOk()
        // The right-click menu only offers Copy: no editing, no row actions.
        .rightClick(rows('Variety').nth(0).find('td').nth(1))
        .expect(contextMenu.find('[data-action=copy]').hasAttribute('disabled')).notOk()
        .expect(contextMenu.find('[data-action=cut]').hasAttribute('disabled')).ok()
        .expect(contextMenu.find('[data-action=paste]').hasAttribute('disabled')).ok()
        .expect(contextMenu.find('[data-action=delete]').exists).notOk();
});

test('Create, update and delete a Variety', async t => {
    await t.useRole(admin);
    const name = unique('Japanese Wineberry');
    const renamed = `${name} (renamed)`;
    await createVariety(t, name);

    // Cells save on change; reopening the table shows what the server has.
    await t
        .typeText(rowWith('Variety', 'name', name).find('[name=name]'), renamed, { replace: true })
        .pressKey('tab')
        .expect(errors.exists).notOk();
    await openModel(t, 'Variety');
    await t.expect(rowWith('Variety', 'name', renamed).exists).ok();

    await deleteVariety(t, renamed);
    await t.expect(errors.exists).notOk();
});

test('Create a Plant, removed with its Variety', async t => {
    await t.useRole(admin);
    const variety = unique('Tayberry');
    const place = unique('Garden');
    await createVariety(t, variety);

    await openModel(t, 'Plant');
    const select = newItem('Plant').find('[name=variety]');
    await t
        .typeText(newItem('Plant').find('[name=date_planted]'), '2025-03-21')
        .pressKey('esc')
        .typeText(newItem('Plant').find('[name=place]'), place)
        .click(select)
        .click(select.find('option').withExactText(variety))
        // Enter in the new-item row adds it too.
        .pressKey('enter')
        .expect(rowWith('Plant', 'place', place).exists).ok()
        .expect(rowWith('Plant', 'place', place).find('[name=variety] option:checked').innerText).eql(variety);

    // Deleting the Variety cascades to the Plant.
    await deleteVariety(t, variety);
    await openModel(t, 'Plant');
    await t
        .expect(rowWith('Plant', 'place', place).exists).notOk()
        .expect(errors.exists).notOk();
});
