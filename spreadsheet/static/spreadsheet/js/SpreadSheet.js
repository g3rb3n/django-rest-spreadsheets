const SpreadSheet = (() => {
    let baseUrl;
    let schemaUrl;
    let onSchemaComplete;
    let gSchema = {};
    const objectCache = {};
    const selectDataCache = {}
    let rowCount = 0;  // load order of rows, to undo sorting
    $.datetimepicker.setDateFormatter('moment');

    const MESSAGE_TIMEOUT = 10000;

    /**
     * Show a message at the bottom of the screen. It disappears after
     * MESSAGE_TIMEOUT or when closed; repeating a message restarts it.
     */
    function showMessage(text, level = 'error') {
        let $messages = $('.messages');
        if (!$messages.length) {
            $messages = $('<div>')
                .addClass('messages')
                .attr('role', 'status')
                .attr('aria-live', 'polite')
                .appendTo('body');
        }
        $messages.children().filter((_, el) => $(el).data('text') === text).remove();
        const $message = $('<div>')
            .addClass('message')
            .addClass(level)
            .data('text', text)
            .appendTo($messages);
        $('<span>').addClass('text').text(text).appendTo($message);
        $('<button>')
            .addClass('close')
            .attr('aria-label', 'Dismiss')
            .text('×')
            .on('click', () => $message.remove())
            .appendTo($message);
        setTimeout(() => $message.remove(), MESSAGE_TIMEOUT);
    }

    /**
     * Human readable text for a failed RestApi6 request: DRF's detail or
     * field errors, the HTTP status, or the network error.
     */
    function errorText(error) {
        const data = error && error.data;
        if (data && typeof data == 'object') {
            return Object.keys(data).map(key => {
                const text = [].concat(data[key]).join(' ');
                return (key == 'detail' || key == 'non_field_errors') ? text : `${key}: ${text}`;
            }).join(' ');
        }
        if (error && error.status)
            return `Request failed (${error.status})`;
        return `Request failed: ${error && error.message || error}`;
    }

    function showError(what, error) {
        console.error(error);
        showMessage(`Could not ${what}: ${errorText(error)}`);
    }

    // Anything that slipped past the handlers below still gets reported.
    window.addEventListener('unhandledrejection', event => showError('complete the request', event.reason));


    function toString(type, data) {
        return data._str;
    }

    /**
     * Map CRUD actions to HTTP methods
     */
    function actionToMethod(action) {
        switch (action) {
            case 'create': return 'POST';
            case 'read':
            case 'list': return 'GET';
            case 'update': return 'PUT';
            case 'delete': return 'DELETE';
            default: throw new Error(`Unknown action: ${action}`);
        }
    }

    /**
     * Construct model API URL
     */
    function urlForModel(modelName) {
        return `${baseUrl}${modelName}/`;
    }

    /**
     * Get schema for model
     */
    function schemaForModel(modelName) {
        return gSchema[modelName];
    }

    /**
     * Whether the user may perform action (read, create, update, delete)
     * on modelName, as reported by the schema from the project's API
     * permissions. A schema without actions allows everything.
     */
    function can(modelName, action) {
        const actions = (gSchema[modelName] || {}).actions;
        return !actions || actions[action] !== false;
    }

    /**
     * The primary key field of a model schema, if it has one.
     */
    function keyField(schema) {
        const name = schema.fields.find(key => schema.properties[key].isKey);
        return name ? schema.properties[name] : null;
    }

    /**
     * The row header cell (as in a spreadsheet) showing the primary key.
     */
    /**
     * Reverse relations are not columns; a many-to-many field is one,
     * shown as a multi-select.
     */
    function isColumn(field){
        return !field.multiple || field.type === 'many';
    }

    function createKeyCell(tag, schema) {
        return $(`<${tag}>`).addClass('key').attr('data-name', keyField(schema).name);
    }

    /**
     * Get object data with caching
     */
    function getObjectRepresentation(url, name, onSuccess) {
        console.log(`getObjectRepresentation ${url}`);

        const cls = url.split('/').slice(-3)[0];

        if (url in objectCache && objectCache[url] === null) {
            setTimeout(() => getObjectRepresentation(url, name, onSuccess), 500);
            return;
        }
        if (url in objectCache) {
            onSuccess(objectCache[url]);
            return;
        }

        objectCache[url] = null;

        RestApi6.get(url).then(data => {
            objectCache[url] = data;
            onSuccess(data);
        });
    }

    /**
     * Fix <select> elements to match their data-selected attribute
     */
    function updateData(action, modelName, url, data){
        console.log(`updateData ${action}, ${modelName}, ${url}, ${data}`)
        if (url in objectCache) objectCache[url] = data;
        if (action == 'delete' && url in objectCache) delete objectCache[url];

        var $tables = $('table[data-class="' + modelName + '"]');
        $tables.each((_, table) => {
            if ($(table).data('loading')) $(table).data('outdated', true);
        });
        var $forms = $('form[data-class="' + modelName + '"]');
        var $selects = $('select[data-class="' + modelName + '"]');
        console.log($selects)
        switch(action) {
            case 'create': handleCreate(modelName, url, data, $tables, $forms, $selects); return;
            case 'update': handleUpdate(modelName, url, data, $tables, $forms, $selects); return;
            case 'delete': handleDelete(modelName, url, data, $tables, $forms, $selects); return;
            default: console.error('No handler for action ' + action + ' in updateData');
        }
    }

    function handleCreate(modelName, url, data, $tables, $form, $selects){
        console.log('handleCreate')
        if (url in selectDataCache){
            delete selectDataCache[url];
        }
        const schema = schemaForModel(modelName);
        $tables.each(function(idx){
            var $table = $(this);
            addTableRow($table, schema, modelName, data);
        })
        console.log(data);
        let $option = createOption(modelName, data);
        $option.appendTo($selects);
        console.log($option);
        fixSelections($selects)
    }

    function handleUpdate(modelName, url, data, $tables, $forms, $selects){
        console.log('handleUpdate')
        let modelUrl = urlForModel(modelName);
        if (modelUrl in selectDataCache){
            delete selectDataCache[modelUrl];
        }
        // Foreign keys arrive as URLs, which are also the <option> values,
        // so every field can be written back as is.
        for (const key in data){
            if (key == '_' || key == '_str') continue;
            updateInputs(url, key, data[key]);
        }
        $('option[data-url="' + url + '"]').text(toString(modelName, data));
        renderMultiSelect($selects);
    }

    function handleDelete(modelName, url, data, $tables, $forms, $selects){
        console.log('handleDelete')
        let modelUrl = urlForModel(modelName);
        if (modelUrl in selectDataCache){
            delete selectDataCache[modelUrl];
        }
        var $elems = $('[data-url="' + url + '"]')
        console.log('removed elems from UI ' + $elems.length)
        $elems.remove();
        fixSelections($selects)
        // The server may have cascaded the delete (or set references to
        // null) in models pointing at this one; resync what is on screen.
        referencingModels(modelName).forEach(syncModel);
    }

    /**
     * Models with a foreign key to modelName, directly or through a chain
     * of foreign keys, so a delete can cascade into them. Includes
     * modelName itself when it references itself.
     */
    function referencingModels(modelName){
        const found = new Set();
        const todo = [modelName];
        while (todo.length){
            const target = todo.pop();
            for (const name in gSchema){
                if (name.startsWith('$') || found.has(name)) continue;
                const schema = gSchema[name];
                const refers = schema.fields.some(key => {
                    const field = schema.properties[key];
                    // Reverse relations carry a lookup, forward keys don't.
                    return field.$ref === target && !field.multiple && !('lookup' in field);
                });
                if (refers){
                    found.add(name);
                    todo.push(name);
                }
            }
        }
        return [...found];
    }

    /**
     * Bring the rows and options shown for modelName in line with the
     * server: drop objects that no longer exist, rewrite the others.
     */
    function syncModel(modelName){
        const url = urlForModel(modelName);
        delete selectDataCache[url];
        const shown = new Set();
        $(`table[data-class="${modelName}"] tr.row`).each((_, tr) => shown.add($(tr).attr('data-url')));
        $(`select[data-class="${modelName}"] option[data-url]`).each((_, option) => shown.add($(option).attr('data-url')));
        if (!shown.size) return;
        RestApi6.get(url)
            .then(items => {
                const byUrl = new Map(items.map(item => [item._, item]));
                shown.forEach(objectUrl => {
                    if (byUrl.has(objectUrl)){
                        updateData('update', modelName, objectUrl, byUrl.get(objectUrl));
                    } else {
                        // Not via handleDelete: referencingModels already
                        // covered the whole chain, so no further resync.
                        delete objectCache[objectUrl];
                        $(`[data-url="${objectUrl}"]`).remove();
                    }
                });
                fixSelections($(`select[data-class="${modelName}"]`));
            })
            .catch(error => showError(`refresh ${modelName}`, error));
    }

    function fixSelections($selects) {
        console.log(`fixSelections ${$selects.length}`);
        $selects.each((_, select) => {
            const $select = $(select);
            $select.val(null);
            if ($select.attr('data-selected')) {
                $select.val(getSelected($select));
            }
        });
        renderMultiSelect($selects);
    }

    /**
     * The value a <select> should have once its options are loaded: a URL,
     * or for a multi-select a list of URLs, kept as JSON.
     */
    function setSelected($select, value){
        $select.attr('data-selected', $select.prop('multiple') ? JSON.stringify(value || []) : value);
    }

    function getSelected($select){
        const value = $select.attr('data-selected');
        if (!$select.prop('multiple')) return value;
        try {
            return JSON.parse(value || '[]');
        } catch (error) {
            return [];
        }
    }

    function updateInputs(url, key, value){
        const $inputs = $('[data-url="' + url + '"] [name="'+ key + '"]');
        $inputs.filter(':checkbox').prop('checked', value === true);
        $inputs.not(':checkbox').val(value);
        // Keep fixSelections from restoring the value from before the update.
        $inputs.filter('select').each((_, select) => setSelected($(select), value));
        renderMultiSelect($inputs);
    }

    /*
    *
    * Button handlers: create, delete, update
    *
    */
    /*
    *
    * Row actions: create, save, delete, clear
    *
    */
    function createRow($tr) {
        var url = $tr.attr('data-url')
        var modelName = $tr.attr('data-class')
        var data = collectData($tr);
        RestApi6.post(url, data)
            .then(data => {
                console.log('got data')
                clearErrors($tr);
                clearRow($tr);
                updateData('create', modelName, url, data);
            })
            .catch(error => showErrors($tr, error, 'create'));
    }

    function saveRow($tr){
        var url = $tr.attr('data-url');
        var modelName = $tr.attr('data-class');
        const data = collectData($tr);
        RestApi6.patch(url, data)
            .then(data => {
                clearErrors($tr);
                updateData('update', modelName, url, data);
            })
            .catch(error => showErrors($tr, error, 'save'));
    }

    function deleteRow($tr){
        var url = $tr.attr('data-url');
        var modelName = $tr.attr('data-class');
        console.log(`delete: ${modelName} ${url}`)
        RestApi6.delete(url)
            .then(data => {
                updateData('delete', modelName, url, data)
            })
            .catch(error => showErrors($tr, error, 'delete'));
    }

    function clearRow($tr) {
        clearErrors($tr);
        $tr.find(':input').not(':checkbox, select').val('');
        $tr.find(':checkbox').prop('checked', false);
        $tr.find('select').each((_, select) => {
            $(select).val(select.querySelector('option[value=""]') ? '' : null);
        });
        renderMultiSelect($tr.find('select'));
    }

    function onDataChange(ev){
        console.log('onDataChange');
        saveRow($(this).closest('tr'));
    }

    // The new-item row has no buttons: Enter adds it (not in a textarea).
    function onNewItemKeydown(ev){
        if (ev.key !== 'Enter' || $(ev.target).is('textarea')) return;
        ev.preventDefault();
        createRow($(this));
    }

    function clearErrors($tr){
        $tr.removeClass('error');
        $tr.find('td.error').removeClass('error');
    }

    /**
     * Show a failed request in the row: DRF field errors next to their
     * input; the row number turns red. The message bar has the details.
     */
    function showErrors($tr, error, verb){
        showError(`${verb} ${$tr.attr('data-class')}`, error);
        clearErrors($tr);
        $tr.addClass('error');
        const data = error && error.data;
        if (!data || typeof data != 'object') return;
        for (const key in data){
            const $input = $tr.find(`[name='${key}']`);
            if (!$input.length) continue;
            const $td = $input.closest('td');
            $td.find('.feedback').text(data[key]);
            $td.addClass('error');
            $input.one('input change', function(){
                $td.removeClass('error');
            })
        }
    }

    /*
    *
    * Context menu (right click), as in Google Sheets
    *
    */
    /*
     * Clipboard: cut, copy and paste a single cell, as in Google Sheets.
     */
    const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
    const shortcut = key => IS_MAC ? `\u2318${key}` : `Ctrl+${key}`;

    function cellInput($td){
        return $td.find(':input').first();
    }

    function isEditable($td){
        const $input = cellInput($td);
        return $input.length > 0 && !$input.prop('disabled') && !$input.prop('readonly');
    }

    // The selected part of a text input, if any (not every input type has one).
    function textSelection(input){
        try {
            if (input.selectionStart != null && input.selectionStart !== input.selectionEnd)
                return [input.selectionStart, input.selectionEnd];
        } catch (error) {}
        return null;
    }

    /**
     * What the cell shows: the selected text, a dropdown's label (not its
     * URL), TRUE/FALSE for a checkbox, or the row number.
     */
    function cellText($td){
        const $input = cellInput($td);
        if (!$input.length) return $td.text().trim();
        const input = $input[0];
        if ($input.is(':checkbox')) return input.checked ? 'TRUE' : 'FALSE';
        if ($input.is('select')) return selectedLabels($input);
        const range = textSelection(input);
        return range ? input.value.slice(range[0], range[1]) : input.value;
    }

    // The labels of the selected options; comma separated for a multi-select.
    function selectedLabels($select){
        return $select.find('option:selected').map((_, option) => option.text).get().join(', ');
    }

    // The option with this label or value, ignoring case.
    function findOption(select, text){
        const wanted = text.trim().toLowerCase();
        return [...select.options].find(option =>
            option.text.trim().toLowerCase() === wanted || option.value === text.trim());
    }

    /**
     * The values for comma separated labels in a multi-select, or null
     * when one of them is not an option. A label with a comma in it
     * matches as a whole.
     */
    function findOptionValues(select, text){
        if (!text.trim()) return [];
        const whole = findOption(select, text);
        if (whole) return [whole.value];
        const options = text.split(',').filter(part => part.trim()).map(part => findOption(select, part));
        if (options.some(option => !option)) return null;
        return options.map(option => option.value);
    }

    /**
     * Put text in the cell like typing would, then save as a normal edit.
     * Returns false when the text doesn't fit the cell.
     */
    function setCellText($td, text){
        const $input = cellInput($td);
        const input = $input[0];
        if ($input.is(':checkbox')){
            const value = text.trim().toLowerCase();
            if (['true', '1', 'yes', 'y', 'x'].includes(value)) input.checked = true;
            else if (['false', '0', 'no', 'n', ''].includes(value)) input.checked = false;
            else return false;
        } else if ($input.is('select[multiple]')){
            const values = findOptionValues(input, text);
            if (!values) return false;
            $input.val(values);
            renderMultiSelect($input);
        } else if ($input.is('select')){
            const option = findOption(input, text);
            if (!option) return false;
            $input.val(option.value);
        } else {
            const range = textSelection(input);
            if (range) input.setRangeText(text, range[0], range[1], 'end');
            else $input.val(text);
        }
        $input.trigger('change');
        return true;
    }

    function canClear($td){
        const $input = cellInput($td);
        return !$input.is('select') || $input.prop('multiple') || $input.find('option[value=""]').length > 0;
    }

    async function writeClipboard(text){
        if (navigator.clipboard && navigator.clipboard.writeText){
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (error) {
                console.error(error);
            }
        }
        // Without the async clipboard API (plain http hosts): the old way.
        const active = document.activeElement;
        const $textarea = $('<textarea>').val(text).addClass('clipboard-buffer').appendTo('body');
        $textarea[0].select();
        const copied = document.execCommand('copy');
        $textarea.remove();
        if (active) active.focus();
        if (!copied) throw new Error('copy was blocked');
    }

    function copyCell($tr, $td){
        return writeClipboard(cellText($td))
            .catch(() => showMessage(`Copying is blocked by the browser, use ${shortcut('C')} instead.`, 'info'));
    }

    function cutCell($tr, $td){
        const $input = cellInput($td);
        const input = $input[0];
        return writeClipboard(cellText($td))
            .then(() => {
                const range = textSelection(input);
                if (range) {
                    input.setRangeText('', range[0], range[1], 'end');
                    $input.trigger('change');
                } else {
                    setCellText($td, '');
                }
                $input.trigger('focus');
            })
            .catch(() => showMessage(`Cutting is blocked by the browser, use ${shortcut('X')} instead.`, 'info'));
    }

    function pasteCell($tr, $td){
        if (!navigator.clipboard || !navigator.clipboard.readText){
            showMessage(`Pasting from the menu is not supported by this browser, use ${shortcut('V')} instead.`, 'info');
            return Promise.resolve();
        }
        return navigator.clipboard.readText()
            .then(text => {
                if (!setCellText($td, text))
                    showMessage(`Cannot paste "${text}" here: it is not one of the options.`);
                cellInput($td).trigger('focus');
            }, error => {
                console.error(error);
                showMessage(`Pasting from the menu is blocked by the browser, use ${shortcut('V')} instead.`, 'info');
            });
    }

    function clipboardActions($td){
        const editable = isEditable($td);
        return [
            {action: 'cut', label: 'Cut', shortcut: shortcut('X'), run: cutCell, disabled: !editable || !canClear($td)},
            {action: 'copy', label: 'Copy', shortcut: shortcut('C'), run: copyCell},
            {action: 'paste', label: 'Paste', shortcut: shortcut('V'), run: pasteCell, disabled: !editable},
        ];
    }

    function rowActions($tr){
        const modelName = $tr.attr('data-class');
        const actions = [];
        if ($tr.attr('data-action') == 'create'){
            if (can(modelName, 'create')){
                actions.push({action: 'create', label: 'Add row', shortcut: 'Enter', run: createRow});
                actions.push({action: 'cancel', label: 'Clear row', run: clearRow});
            }
        } else if ($tr.hasClass('row')){
            if (can(modelName, 'update'))
                actions.push({action: 'update', label: 'Save row', run: saveRow});
            if (can(modelName, 'delete')){
                if (actions.length) actions.push({separator: true});
                actions.push({action: 'delete', label: 'Delete row', run: deleteRow});
            }
        }
        return actions;
    }

    function onContextMenu(ev){
        const $td = $(this);
        const $tr = $td.closest('tr');
        const rows = rowActions($tr);
        const actions = clipboardActions($td).concat(rows.length ? [{separator: true}] : [], rows);
        ev.preventDefault();
        selectCell.call(this);
        let x = ev.clientX, y = ev.clientY;
        if (!x && !y){
            // Opened from the keyboard (menu key, Shift+F10).
            const rect = this.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom;
        }
        showContextMenu(actions, $tr, $td, x, y);
    }

    function showContextMenu(actions, $tr, $td, x, y){
        closeContextMenu();
        const $menu = $('<div>')
            .addClass('context-menu')
            .attr('role', 'menu')
            .appendTo('body');
        actions.forEach(item => {
            if (item.separator){
                $('<div>').addClass('separator').attr('role', 'separator').appendTo($menu);
                return;
            }
            const $item = $('<button>')
                .attr('type', 'button')
                .attr('role', 'menuitem')
                .attr('data-action', item.action)
                .prop('disabled', !!item.disabled)
                .on('click', () => {
                    closeContextMenu(true);
                    item.run($tr, $td);
                })
                .appendTo($menu);
            $('<span>').addClass('icon').attr('aria-hidden', 'true').appendTo($item);
            $('<span>').addClass('label').text(item.label).appendTo($item);
            $('<span>').addClass('shortcut').text(item.shortcut || '').appendTo($item);
        });
        // Keep it on screen, as close to the pointer as fits.
        const width = $menu.outerWidth(), height = $menu.outerHeight();
        $menu.css({
            left: Math.max(0, Math.min(x, window.innerWidth - width - 4)),
            top: Math.max(0, Math.min(y, window.innerHeight - height - 4)),
        });
        $menu.data('return-focus', document.activeElement);
        $menu.find('[role=menuitem]:not(:disabled)').first().trigger('focus');
        $menu.on('keydown', onContextMenuKeydown);
    }

    function onContextMenuKeydown(ev){
        const $items = $(this).find('[role=menuitem]:not(:disabled)');
        const index = $items.index(document.activeElement);
        if (ev.key == 'ArrowDown' || ev.key == 'ArrowUp'){
            ev.preventDefault();
            const step = ev.key == 'ArrowDown' ? 1 : -1;
            $items.eq((index + step + $items.length) % $items.length).trigger('focus');
        } else if (ev.key == 'Escape' || ev.key == 'Tab'){
            ev.preventDefault();
            closeContextMenu(true);
        }
    }

    function closeContextMenu(restoreFocus){
        const $menu = $('.context-menu');
        if (!$menu.length) return;
        const returnFocus = $menu.data('return-focus');
        $menu.remove();
        if (restoreFocus && returnFocus) returnFocus.focus();
    }

    $(document).on('mousedown', ev => {
        if (!$(ev.target).closest('.context-menu').length) closeContextMenu();
    });
    $(window).on('blur resize', () => closeContextMenu());
    document.addEventListener('scroll', () => closeContextMenu(), true);

    /*
     * Multi-select, as the dropdown chips in Google Sheets: the hidden
     * <select multiple> holds the value, a button next to it shows the
     * selected labels and opens a checklist. Changes save on closing it.
     */
    function renderMultiSelect($selects){
        $selects.filter('select[multiple]').each((_, select) => {
            const $select = $(select);
            let $button = $select.next('.multi-select');
            if (!$button.length){
                if (!select.parentNode) return;
                $button = $('<button>')
                    .attr('type', 'button')
                    .attr('aria-haspopup', 'listbox')
                    .addClass('multi-select')
                    .insertAfter($select);
            }
            $button.prop('disabled', select.disabled).empty();
            $select.find('option:selected').each((_, option) => {
                $('<span>').addClass('chip').text(option.text).appendTo($button);
            });
        });
    }

    function onMultiSelectClick(){
        const $menu = $('.multi-select-menu');
        const open = $menu.length && $menu.data('button') === this;
        closeMultiSelectMenu();
        if (!open) openMultiSelectMenu($(this));
    }

    function onMultiSelectKeydown(ev){
        if (ev.key != 'ArrowDown') return;
        ev.preventDefault();
        openMultiSelectMenu($(this));
    }

    function openMultiSelectMenu($button){
        closeMultiSelectMenu();
        const $select = $button.prev('select');
        const $menu = $('<div>')
            .addClass('multi-select-menu')
            .attr('role', 'listbox')
            .attr('aria-multiselectable', 'true')
            .data('select', $select)
            .data('button', $button[0])
            .data('before', JSON.stringify($select.val()))
            .appendTo('body');
        $select.find('option').each((_, option) => {
            const $label = $('<label>').attr('role', 'option').appendTo($menu);
            $('<input>')
                .attr('type', 'checkbox')
                .prop('checked', option.selected)
                .on('change', function(){
                    option.selected = this.checked;
                    renderMultiSelect($select);
                })
                .appendTo($label);
            $('<span>').text(option.text).appendTo($label);
        });
        if (!$select.find('option').length)
            $('<div>').addClass('empty').text('No options').appendTo($menu);
        // Below the cell, kept on screen.
        const rect = $button.closest('td')[0].getBoundingClientRect();
        $menu.css('min-width', rect.width);
        const width = $menu.outerWidth(), height = $menu.outerHeight();
        $menu.css({
            left: Math.max(0, Math.min(rect.left, window.innerWidth - width - 4)),
            top: rect.bottom + height > window.innerHeight ? Math.max(0, rect.top - height) : rect.bottom,
        });
        $menu.on('keydown', onMultiSelectMenuKeydown);
        $menu.find('input').first().trigger('focus');
    }

    function onMultiSelectMenuKeydown(ev){
        const $items = $(this).find('input');
        const index = $items.index(document.activeElement);
        if (ev.key == 'ArrowDown' || ev.key == 'ArrowUp'){
            ev.preventDefault();
            const step = ev.key == 'ArrowDown' ? 1 : -1;
            $items.eq((index + step + $items.length) % $items.length).trigger('focus');
        } else if (ev.key == 'Escape'){
            ev.preventDefault();
            closeMultiSelectMenu(true, true);
        } else if (ev.key == 'Enter' || ev.key == 'Tab'){
            ev.preventDefault();
            closeMultiSelectMenu(true);
        }
    }

    /**
     * Close the checklist and save when the selection changed; Escape
     * (cancel) puts the selection back instead.
     */
    function closeMultiSelectMenu(restoreFocus, cancel){
        const $menu = $('.multi-select-menu');
        if (!$menu.length) return;
        const $select = $menu.data('select');
        const button = $menu.data('button');
        const before = $menu.data('before');
        $menu.remove();
        if (cancel) {
            $select.val(JSON.parse(before));
            renderMultiSelect($select);
        } else if (JSON.stringify($select.val()) !== before) {
            $select.trigger('change');
        }
        if (restoreFocus) button.focus();
    }

    $(document).on('click', 'button.multi-select', onMultiSelectClick);
    $(document).on('keydown', 'button.multi-select', onMultiSelectKeydown);
    $(document).on('mousedown', ev => {
        const $menu = $('.multi-select-menu');
        // Its own button toggles it on click.
        if ($(ev.target).closest('.multi-select-menu').length) return;
        if ($menu.length && $(ev.target).closest('button.multi-select')[0] === $menu.data('button')) return;
        closeMultiSelectMenu();
    });
    $(window).on('blur resize', () => closeMultiSelectMenu());
    document.addEventListener('scroll', ev => {
        if (!$(ev.target).closest('.multi-select-menu').length) closeMultiSelectMenu();
    }, true);

    /*
    *
    * Tables
    *
    */
    function createTableOverlay(schema, modelName){
        console.log('createTableOverlay')
        console.log(schema)
        var $overlay = $('<div>')
            .addClass('overlay')
            .addClass('table')
            .attr('data-class', modelName);
        createTable(schema, modelName)
            .appendTo($overlay);
        return $overlay;
    }

    function createTable(schema, modelName){
        console.log('createTable')
        console.log(schema)
        var $table = $('<table>')
            .attr('data-class', modelName)
            .attr('data-url', baseUrl + modelName + '/');
        createTableColGroup(schema)
            .appendTo($table);
        createTableHeaderRow(schema, modelName)
            .appendTo($table);
        $table.on('refresh', function(){
            console.log('table.refresh')
            loadTable($table, schema, modelName);
        })
        if (can(modelName, 'create'))
            createTableRowNewItem($table, schema, modelName, 'create').appendTo($table);
        // mousedown as well: read-only (disabled) cells never get focus.
        $table.on('focusin mousedown', 'td', selectCell);
        $table.on('mouseover', 'td', hoverCell);
        $table.on('mouseover', 'th', clearHover);
        $table.on('mouseleave', clearHover);
        $table.on('contextmenu', 'td', onContextMenu);
        $table.on('click', 'th', onHeaderClick);
        return $table;
    }

    /**
     * Clicking a column header sorts on it: ascending, descending, then
     * back to the order the server sent. Sorting is done in the browser,
     * so the server's ordering and filters stay in charge of what is loaded.
     */
    function onHeaderClick(){
        const $table = $(this).closest('table');
        const column = this.cellIndex;
        const sort = $table.data('sort');
        let direction = 1;
        if (sort && sort.column === column)
            direction = sort.direction === 1 ? -1 : 0;
        $table.data('sort', direction ? {column, direction} : null);
        const $headers = $table.find('tr').first().children();
        $headers.removeClass('sort-asc sort-desc').removeAttr('aria-sort');
        if (direction)
            $headers.eq(column)
                .addClass(direction === 1 ? 'sort-asc' : 'sort-desc')
                .attr('aria-sort', direction === 1 ? 'ascending' : 'descending');
        sortTable($table);
    }

    /**
     * What a cell is sorted on: what it shows, so a dropdown sorts on its
     * label rather than its URL. Null for an empty cell.
     */
    function sortValue($td, numeric){
        const $input = cellInput($td);
        let value;
        if (!$input.length) value = $td.text().trim();
        else if ($input.is(':checkbox')) return $input.prop('checked') ? 1 : 0;
        else if ($input.is('select')) value = selectedLabels($input);
        else value = $input.val();
        if (value === '' || value == null) return null;
        if (numeric){
            const number = parseFloat(value);
            return isNaN(number) ? null : number;
        }
        return value;
    }

    function compareValues(a, b){
        if (typeof a === 'number') return a - b;
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    }

    function sortTable($table){
        const $rows = $table.find('tr.row');
        const sort = $table.data('sort');
        let rows = $rows.get();
        if (!sort){
            rows.sort((a, b) => $(a).data('order') - $(b).data('order'));
        } else {
            const $th = $table.find('tr').first().children().eq(sort.column);
            const numeric = $th.hasClass('key') || ['number', 'integer'].includes($th.attr('type'));
            const values = new Map(rows.map(row =>
                [row, sortValue($(row).children().eq(sort.column), numeric)]));
            rows.sort((a, b) => {
                const x = values.get(a), y = values.get(b);
                // Empty cells go last either way, as in Google Sheets.
                if (x === null || y === null) return (x === null) - (y === null);
                return sort.direction * compareValues(x, y);
            });
        }
        $table.append(rows);
    }

    /**
     * Sort again once the dropdowns in the sorted column have their
     * labels; they load after the rows.
     */
    function sortTableWhenLoaded($table){
        const sort = $table.data('sort');
        if (!sort) return;
        const url = $table.find('tr.row').first().children().eq(sort.column)
            .find('select[data-url]').attr('data-url');
        const entry = url && selectDataCache[url];
        if (entry && entry.status === 'pending') entry.callbacks.push(() => sortTable($table));
        else sortTable($table);
    }

    /**
     * Mark the selected cell, its row and its column header, as Google
     * Sheets does. Stays until another cell of the table is selected.
     */
    function selectCell(){
        const $td = $(this);
        const $table = $td.closest('table');
        $table.find('.selected').removeClass('selected');
        $td.parent().addClass('selected');
        $td.addClass('selected');
        $table.find('tr').first().children().eq(this.cellIndex).addClass('selected');
    }

    /**
     * Tint the row and column header of the cell under the mouse, a
     * fainter version of the selection.
     */
    function hoverCell(){
        const $td = $(this);
        const $table = $td.closest('table');
        clearHover.call($table[0]);
        $td.parent().addClass('hovered');
        $table.find('tr').first().children().eq(this.cellIndex).addClass('hovered');
    }

    function clearHover(){
        $(this).closest('table').find('.hovered').removeClass('hovered');
    }

    function createTableHeaderRow(schema, modelName){
        console.log('createTableHeaderRow')
        var $tr = $('<tr>')
        console.log(schema)
        if (keyField(schema))
            createKeyCell('th', schema).text(keyField(schema).title).appendTo($tr);
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return
            if (!isColumn(field)) return
            var $th = $('<th>')
                .attr('data-name', key)
                .attr('data-class', field.$ref)
                .attr('type', field.type)
                .appendTo($tr);
            $('<h2>')
                .text(field.title)
                .appendTo($th);
        });
        return $tr;
    }

    function createTableColGroup(schema){
        console.log('createTableColGroup')
        var $cg = $('<colgroup>')
        console.log(schema)
        if (keyField(schema))
            $('<col>').addClass('key').appendTo($cg);
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return
            if (!isColumn(field)) return
            const $col = $('<col>')
                .attr('type', field.type)
                .appendTo($cg);
            if (field.length) {
                $col.css('width', `${field.length}ch`);
                //$col.css('max-width', `250ch`);
            }
        });
        return $cg;
    }

    /**
     * Fetch the rows. A row created, saved or deleted while the request is
     * on its way makes the answer outdated (it would drop the new row or
     * bring back the deleted one), so then it is fetched again.
     */
    function loadTable($table, schema, modelName){
        const request = {};
        $table.data('loading', request).data('outdated', false);
        RestApi6.get($table.attr('data-url'))
            .then(data => {
                if ($table.data('loading') !== request) return;  // a newer load runs
                if ($table.data('outdated')) return loadTable($table, schema, modelName);
                $table.removeData('loading');
                fillTable($table, schema, modelName, data);
            })
            .catch(error => {
                if ($table.data('loading') === request) $table.removeData('loading');
                showError(`load ${modelName}`, error);
            });
    }

    function fillTable($table, schema, modelName, data){
        console.log('fillTable')
        $table.find('.row').remove()
        data.forEach(function(item){
            addTableRow($table, schema, modelName, item);
        })
        sortTableWhenLoaded($table);
    }

    function collectData($form) {
        var $fields = $form.find(':input');
        var d = {};
        $fields.each(function(i){
            var $el = $(this);
            if (!$el.attr('name')) return;
            d[$el.attr('name')] = $el.val();
            if ($el.attr('type') == 'checkbox')
                d[$el.attr('name')] = $el.is(':checked');
        });
        return d;
    }

    function createTableRowNewItem($table, schema, modelName, action){
        var url = urlForModel(modelName);
        var $tr = $('<tr>')
            .addClass('tableform')
            .attr('data-url', urlForModel(modelName))
            .attr('data-action', action)
            .attr('data-class', modelName)
            //.attr('method', actionToMethod(action))
            .attr('action', urlForModel(modelName));
        const key = keyField(schema);
        if (key){
            const $key = createKeyCell('td', schema).appendTo($tr);
            // A natural key is entered on create; generated keys get a hint.
            if (!key.generated){
                createInput(key, null).attr('required', 'required').appendTo($key);
                $('<span>').addClass('feedback').attr('for', key.name).appendTo($key);
            } else {
                $key.text('+');
            }
        }
        $tr.attr('title', 'New row: press Enter or right-click to add');
        $tr.on('keydown', onNewItemKeydown);
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return;
            if (!isColumn(field)) return;
            var $td = $('<td>').appendTo($tr);
            var $input = createInput(field, null).appendTo($td);
            if (field.required) $input.attr('required', 'required');
            if (field.readOnly) $input.prop('disabled', true);
            renderMultiSelect($input);
            var $feedback = $('<span>').addClass('feedback').attr('for',field.name).appendTo($td);
        })
        return $tr;
    }

    function createTableRowItem($table, schema, modelName, action, data){
        var url = urlForModel(modelName);
        var $tr = $('<tr>')
            .addClass('tableform')
            .addClass('row')
            .attr('data-url', data._)
            .attr('data-action', action)
            .attr('data-class', modelName)
            //.attr('method', actionToMethod(action))
            .attr('action', urlForModel(modelName));
        if (keyField(schema))
            createKeyCell('td', schema).text(data[keyField(schema).name]).appendTo($tr);
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            var value = data[key];
            if (field.isKey) return;
            if (!isColumn(field)) return;
            var $td = $('<td>').appendTo($tr);
            var $input = createInputWithValue(field, value).appendTo($td);
            if (field.required) $input.attr('required', 'required');
            if (!can(modelName, 'update') || field.readOnly) $input.prop('disabled', true);
            renderMultiSelect($input);
            var $feedback = $('<span>').addClass('feedback').attr('for',field.name).appendTo($td);
        })
        return $tr;
    }

    function createInputWithValue(schema, value){
        const $input = createInput(schema, value);
        // Existing rows save on change; the new-item row waits for Create.
        $input.on('change', onDataChange);
        if ($input.prop("tagName") == "SELECT"){
            setSelected($input, value);
        }else if ($input.attr('type') == 'checkbox'){
            $input.prop('checked', value === true);
        }else if ($input.prop("tagName") == "TEXTAREA"){
            $input.text(value);
        }else{
            $input.attr('value', value !== null && typeof value == 'object' ? JSON.stringify(value) : value);
        }
        return $input;
    }

    function createInput(schema, value){
        switch(schema.type){
            case 'string': return $('<input>').attr('type', 'text').attr('name', schema.name);
            case 'text': return $('<textarea>').attr('rows', 1).attr('name', schema.name);
            case 'number': return $('<input>').attr('type', 'number').attr('step', schema.step).attr('name', schema.name);
            case 'integer': return $('<input>').attr('type', 'number').attr('name', schema.name);
            case 'boolean': return $('<input>').attr('type', 'checkbox').attr('name', schema.name);
            case 'datetime': return $('<input>').attr('type', 'text').attr('name', schema.name).datetimepicker({ format:'YYYY-MM-DDTHH:mm', });
            case 'date': return $('<input>').attr('type', 'text').attr('name', schema.name).datepicker({ dateFormat: 'yy-mm-dd' }).show();
            case 'time': return $('<input>').attr('type', 'text').attr('name', schema.name).datetimepicker({ datepicker: false, format: 'HH:mm', });
            case 'oneOf': return createSelectFromChoices(schema, value).attr('name', schema.name);
            case 'object': return createSelectFromData(schema, value).attr('name', schema.name);
            case 'many': return createSelectFromData(schema, value).attr('name', schema.name);
            default:
                // Show the value but leave it out of collectData (no name),
                // so one unknown field doesn't break the whole table.
                console.error(schema.type + ' is not supported, showing ' + schema.name + ' read-only');
                return $('<input>').attr('type', 'text').prop('readonly', true).attr('title', schema.type + ' is not supported');
        }
    }

    function createSelectFromChoices(schema, value){
        console.log('createSelectFromChoices')
        var $select = $('<select>');
        if (!schema.required)
            $('<option>').attr('value', '').appendTo($select);
        schema.oneOf.forEach(function(choice){
            $('<option>')
                .attr('value', choice.const)
                .text(choice.title)
                .appendTo($select);
        })
        $select.val(value === null || value === undefined ? '' : String(value));
        return $select;
    }

    function createSelectFromData(schema, value){
        console.log(`createSelectFromData ${schema.title}`)
        var url = urlForModel(schema.$ref)
        var $select = $('<select>')
            .attr('data-url', url)
            .attr('data-class', schema.$ref)
            .prop('multiple', !!schema.multiple);
        // Optional relations need a way to select "none"; a multi-select
        // selects nothing.
        if (!schema.required && !schema.multiple)
            $('<option>').attr('value', '').appendTo($select);
        if (value)
            setSelected($select, value);
        cachedFillSelect(schema, url, $select);
        return $select;
    }

    function createOption(name, item){
        return $('<option>')
            .attr('value', item._)
            .attr('data-url', item._)
            .text(toString(name, item))
    }

    function cachedFillSelect(schema, url, $select){
        console.log(`cachedFillSelect`)
        function populateSelect(data) {
            console.log(`populateSelect ${$select.attr('data-url')} ${$select.closest('tr').attr('data-url')} ${data.length}`)
            console.log($select.attr('data-selected'))

            data.forEach(function(item) {
                // handleCreate may have added it while the list was loading.
                if ($select.find(`option[value="${item._}"]`).length) return;
                createOption(schema.$ref, item).appendTo($select);
            });
            $select.val(getSelected($select));
            renderMultiSelect($select);
        }

        // If we already have data, just populate
        if (selectDataCache[url] && selectDataCache[url].status === 'done') {
            populateSelect(selectDataCache[url].data);
        } 
        // If there’s a pending request, attach callback
        else if (selectDataCache[url] && selectDataCache[url].status === 'pending') {
            selectDataCache[url].callbacks.push(populateSelect);
        } 
        // No cache: make the API call
        else {
            console.log(`cachedFillSelect`)
            // Keep a reference: handleCreate/Update/Delete may drop the
            // entry from selectDataCache while the request is in flight.
            const entry = selectDataCache[url] = {
                status: 'pending',
                callbacks: [populateSelect]
            };
            RestApi6.get(url)
                .then(data => {
                    console.log('got data')
                    console.log(data)
                    entry.status = 'done';
                    entry.data = data;
                    // Call all queued callbacks
                    entry.callbacks.forEach(cb => cb(data));
                    entry.callbacks = [];
                })
                .catch(error => {
                    showError(`load the ${schema.$ref} options`, error);
                    // Let the next select retry instead of waiting forever.
                    if (selectDataCache[url] === entry) delete selectDataCache[url];
                });
        }
    }


    function addTableRow($table, schema, modelName, item){
        createTableRowItem($table, schema, modelName, '', item)
            .data('order', rowCount++)
            .appendTo($table);
    }

    function init(config) {
        baseUrl = config.restBaseUrl;
        schemaUrl = config.schemaUrl;
        onSchemaComplete = config.onSchemaComplete;
        return loadSchema(schemaUrl, onSchemaComplete);
    }

    /**
     * Load API schema and build navigation
     */
    function loadSchema(url, onSchemaComplete) {
        return RestApi6.get(url).then(dataSchema => {
            gSchema = dataSchema;
            $('nav ul.models').empty();

            for (const key in dataSchema) {
                if (key.startsWith('$')) continue;
                $('<li>')
                    .attr({'data-class': key, role: 'tab', 'aria-selected': 'false', tabindex: '-1'})
                    .text(key)
                    .appendTo($('nav ul.models'));
            }
            if (typeof onSchemaComplete === 'function') {
                onSchemaComplete(dataSchema);
            }
            return dataSchema;
        }).catch(error => showError('load the schema', error));
    }

    /**
     * Load the schema again, e.g. after logging in or out: the models and
     * actions it lists depend on the user. Cached data is dropped too.
     */
    function reload() {
        for (const url in objectCache) delete objectCache[url];
        for (const url in selectDataCache) delete selectDataCache[url];
        return loadSchema(schemaUrl, onSchemaComplete);
    }

    function createTableForModel(model){
        console.log(gSchema)
        console.log(model)
        var modelSchema = gSchema[model]
        console.log(modelSchema)
        createTableOverlay(modelSchema, model).appendTo($('main'));
    }

    // Public API
    return {
        init: (url) => init(url),
        loadSchema: (url, onSchemaComplete) => loadSchema(url, onSchemaComplete),
        reload: () => reload(),
        createTableForModel: (model) => createTableForModel(model),
    };
})();
