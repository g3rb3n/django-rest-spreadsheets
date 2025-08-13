import { Selector, RequestLogger } from 'testcafe';


const apiLogger = RequestLogger(
    /\/rest\/api\/Variety\//, // regex for the URL
    {
        logResponseBody: true,
        logResponseHeaders: true
    }
);
fixture`Variety Create Test`
    .page`http://localhost:8000/`; // your Django server

test('Create Variety button works', async t => {
    // Selector for the dynamically generated button

    const menu = Selector('.menu-item');
    const menuVariety = Selector('li[data-class=Variety]');
    const logo = Selector('header img')
    const buttonCreate = Selector('button')
        .withAttribute('data-action', 'create');

    const inputName = Selector('input[name="name"]');
    const tr = Selector('table[data-class=Variety] tr');

    await t
        .hover(menu)
        .click(menuVariety)
        .hover(logo);
    const countBefore = await tr.count;
    await t
        .typeText(inputName, 'Japanse Wineberry')
        .click(buttonCreate);
    //await t.expect(apiLogger.contains(r => r.response.statusCode === 200)).ok({ timeout: 5000 });
    const countAfter = await tr.count;

    await t.expect(countAfter - countBefore).eql(1);
});

test('Delete Variety button works', async t => {
    // Selector for the dynamically generated button

    const menu = Selector('.menu-item');
    const menuVariety = Selector('li[data-class=Variety]');
    const logo = Selector('header img')
    const buttonDelete = Selector('button')
        .withAttribute('data-action', 'delete')
        .nth(-1);
    const tr = Selector('table[data-class=Variety] tr');

    await t
        .hover(menu)
        .click(menuVariety)
        .hover(logo);
    const countBefore = await tr.count;
    await t
        .click(buttonDelete);
    const countAfter = await tr.count;

    await t.expect(countAfter - countBefore).eql(-1);
});

test('Update Variety button works', async t => {
    // Selector for the dynamically generated button

    const menu = Selector('.menu-item');
    const menuVariety = Selector('li[data-class=Variety]');
    const logo = Selector('header img')
    const inputName = Selector('input[name="name"]').nth(-1);
    const buttonUpdate = Selector('button')
        .withAttribute('data-action', 'update')
        .nth(-1);
    const tr = Selector('table[data-class=Variety] tr');
    const trItem = Selector('table[data-class=Variety] tr')
        .nth(-1);

    await t
        .hover(menu)
        .click(menuVariety)
        .hover(logo);
    const countBefore = await tr.count;
    await t
        .typeText(inputName, 'Japanse Wineberry')
        .click(buttonUpdate);
    const countAfter = await tr.count;

    await t.expect(countAfter - countBefore).eql(0);
});


test('Create Plant button works', async t => {
    const menu = Selector('.menu-item');
    const menuPlant = Selector('li[data-class=Plant]');
    const logo = Selector('header img')
    const buttonCreate = Selector('button')
        .withAttribute('data-action', 'create');

    const selectVariery = Selector('select[name="variety"]');
    const inputDate = Selector('input[name="date_planted"]');
    const inputPlace = Selector('input[name="place"]');

    const tr = Selector('table[data-class=Plant] tr');
    await t
        .hover(menu)
        .click(menuPlant)
        .hover(logo);
    const countBefore = await tr.count;
    await t
        .click(selectVariery)
        .click(selectVariery.find('option[value="http://localhost:8000/rest/api/Variety/1/"]'))
        .typeText(inputDate, '2025-03-21')
        .typeText(inputPlace, 'Garden')
        .click(buttonCreate);
    const countAfter = await tr.count;
    await t.expect(countAfter - countBefore).eql(1);
});
