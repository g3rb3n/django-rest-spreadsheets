const SpreadSheet = (() => {
    let baseUrl;
    let gSchema = {};
    const objectCache = {};
    const selectDataCache = {}
    $.datetimepicker.setDateFormatter('moment');


    function toString(type, data) {
        return data._str;
    }

    var urlToString = function(url, data){
        var cls = url.split('/').splice(-3)[0];
        console.log('urlToString:' + cls)
        return toString(cls, data);
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
        var $forms = $('form[data-class="' + modelName + '"]');
        var $selects = $('select[data-class="' + modelName + '"]');
        console.log($selects)
        switch(action) {
            case 'create': handleCreate(modelName, url, data, $tables, $forms, $selects); return;
            case 'update': handleUpdate(modelName, url, data, $tables, $forms, $selects); return;
            case 'delete': handleDelete(modelName, url, data, $tables, $forms, $selects); return;
            default: console.log('No  handler for action ' + action + ' in updateData');
        }
    }

    function handleCreate(modelName, url, data, $tables, $form, $selects){
        console.log('handleCreate')
        const schema = schemaForModel(modelName);
        $tables.each(function(idx){
            var $table = $(this);
            addTableRow($table, schema, modelName, data);
        })
        createOption(modelName, data).appendTo($selects);
        fixSelections($selects)
    }

    function handleUpdate(modelName, url, data, $tables, $forms, $selects){
        console.log('handleUpdate')
        for (key in data){
            if (key == 'url') continue;
            console.log('handleUpdate url ' + url)
            console.log('handleUpdate key ' + key)
            console.log('handleUpdate val ' + data[key])
            if (typeof data[key] == 'string')
                if (data[key].startsWith('http')){
                    var url2 = data[key];
                    RestApi6.get(url2)
                        .then(data => {
                            console.log('handleUpdate get ' + url2)
                            var str = urlToString(url2, data);
                            console.log('str:' + str)
                            updateInputs(url, key, data[key]);
                        })
                    continue;
                }
            updateInputs(url, key, data[key]);
            $('option[data-url="' + url + '"]').text(data[key]);
        }
    }

    function handleDelete(modelName, url, data, $tables, $forms, $selects){
        console.log('handleDelete')
        var $elems = $('[data-url="' + url + '"]')
        console.log('removed elems from UI ' + $elems.length)
        $elems.remove();
        fixSelections($selects)
    }

    function fixSelections($selects) {
        console.log(`fixSelections ${$selects.length}`);
        $selects.each((_, select) => {
            const $select = $(select);
            $select.val(null);
            if ($select.attr('data-selected')) {
                $select.val($select.attr('data-selected'));
            }
        });
    }

    function updateInputs(url, key, value){
        $('input[data-url="' + url + '"] [name="'+ key + '"]').text(value);
        $('[data-url="' + url + '"] [name="'+ key + '"]').val(value);
    }

    /*
    *
    * Button handlers: create, delete, update
    *
    */
    function buttonCreateOnClick(ev) {
        console.log('Submit');
        ev.preventDefault();
        var $button = $(this)
        var $tr = $(this).parents('tr');
        var url = $tr.attr('data-url')
        var modelName = $tr.attr('data-class')
        var data = collect_data($tr);
        RestApi6.post(url, data)
            .then(data => {
                console.log('got data')
                updateData('create', modelName, url, data);
            })
            .catch(error => {
                for (key in error.data){
                    const $input = $tr.find(`[name='${key}']`);
                    const $td = $input.closest('td');
                    $td.find('.feedback').text(error.data[key]);
                    $td.addClass('error');
                    $input.on("input", function(){
                        $td.removeClass('error');
                    })
                }
            });
    }

    function buttonUpdateOnClick(ev){
        console.log('buttonUpdateOnClick');
        ev.preventDefault();
        var $button = $(this);
        var $tr = $button.closest('tr');
        var url = $tr.attr('data-url');
        var action = $button.attr('data-action');
        var modelName = $button.closest('table').attr('data-class');
        console.log('update:' + url)
        const data = collect_data($tr);
        /*
        $tr.find('[contenteditable="true"]').each(function() {
            var name = $(this).attr('name');
            if (name) {
                data[name] = $(this).text().trim();
            }
        });
        $tr.find('input, select, textarea').each(function() {
            var name = $(this).attr('name');
            if (name) {
                data[name] = $(this).val();
            }
        });
        */
        console.log(data);
        RestApi6.patch(url, data)
            .then(data => {
                updateData(action, modelName, url, data);
            })
        return;
    }

    function buttonDeleteOnClick(ev){
        ev.preventDefault();
        var $button = $(this);
        var url = $button.closest('tr').attr('data-url');
        var action = $button.attr('data-action');
        var modelName = $button.closest('[data-class]').attr('data-class');
        console.log(`delete: ${modelName} ${url}`)
        RestApi6.delete(url)
            .then(data => {
                updateData('delete', modelName, url, data)
            })
        return;
    }


    function buttonCancelOnClick(ev) {
        ev.preventDefault();
        var $button = $(this);
        const $tr = $button.closest('tr');
        $tr.find(':input').val('');
    }

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
        createTableHeaderRow(schema)
            .appendTo($table);
        var $form = createTableRowNewItem($table, schema, modelName, 'create');
        $table.on('refresh', function(){
            console.log('table.refresh')
            var url = $(this).attr('data-url');
            RestApi6.get(url)
                .then(data => {
                    fillTable($table, schema, modelName, data);
                })
        })
        $form.appendTo($table);
        return $table;
    }

    function createTableHeaderRow(schema){
        console.log('createTableHeaderRow')
        var $tr = $('<tr>')
        console.log(schema)
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return
            if (field.multiple) return
            var $th = $('<th>')
                .attr('data-name', key)
                .attr('data-class', field.$ref)
                .attr('type', field.type)
                .appendTo($tr);
            var $h2 = $('<h2>')
                .text(field.title)
                .appendTo($th);
            $('<span>')
                .addClass('tooltip')
                .text(field.title)
                .appendTo($th);
        });
        $('<th>')
            .addClass('actions')
            .text('Actions')
            .appendTo($tr);
        return $tr;
    }

    function createTableColGroup(schema){
        console.log('createTableColGroup')
        var $cg = $('<colgroup>')
        console.log(schema)
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return
            if (field.multiple) return
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

    function fillTable($table, schema, modelName, data){
        console.log('fillTable')
        $table.find('.row').remove()
        data.forEach(function(item){
            addTableRow($table, schema, modelName, item);
        })
    }

    function collect_data($form) {
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
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            if (field.isKey) return;
            if (field.multiple) return;
            var $td = $('<td>').appendTo($tr);
            var $input = createInput(field, null).appendTo($td);
            if (field.required) $input.attr('required', 'required');
            var $feedback = $('<span>').addClass('feedback').attr('for',field.name).appendTo($td);
        })
        var $tdActions = $('<td>').appendTo($tr);
        createTableRowButton(url, 'create', 'Create', buttonCreateOnClick).appendTo($tdActions);
        createTableRowButton('', 'cancel', 'Cancel', buttonCancelOnClick).appendTo($tdActions);
        return $tr;
    }

    function createTableRowItem($table, schema, modelName, action, data){
        var url = urlForModel(modelName);
        var $tr = $('<tr>')
            .addClass('tableform')
            .attr('data-url', data._)
            .attr('data-action', action)
            .attr('data-class', modelName)
            //.attr('method', actionToMethod(action))
            .attr('action', urlForModel(modelName));
        schema.fields.forEach(function(key){
            var field = schema.properties[key];
            var value = data[key];
            if (field.isKey) return;
            if (field.multiple) return;
            var $td = $('<td>').appendTo($tr);
            var $input = createInputWithValue(field, value).appendTo($td);
            if (field.required) $input.attr('required', 'required');
            var $feedback = $('<span>').addClass('feedback').attr('for',field.name).appendTo($td);
        })
        var $tdActions = $('<td>').appendTo($tr);
        createTableRowButton(data._, 'update', 'Update', buttonUpdateOnClick).appendTo($tdActions);
        createTableRowButton(data._, 'delete', 'Delete', buttonDeleteOnClick).appendTo($tdActions);
        return $tr;
    }

    function createTableRowButton(url, action, text, onClick){
        var $button = $('<button>')
            .attr('data-url', url)
            .attr('data-action', action)
            .text(text);
        $button.on('click', onClick);
        return $button;
    }

    function createInputWithValue(schema, value){
        const $input = createInput(schema, value);
        if ($input.prop("tagName") == "SELECT"){
            $input.attr('data-selected', value);
        }else{
            $input.attr('value', value);
        }
        return $input;
    }

    function createInput(schema, value){
        switch(schema.type){
            case 'string': return $('<input>').attr('type', 'text').attr('name', schema.name);
            case 'number': return $('<input>').attr('type', 'number').attr('step', schema.step).attr('name', schema.name);
            case 'integer': return $('<input>').attr('type', 'number').attr('name', schema.name);
            case 'boolean': return $('<input>').attr('type', 'checkbox').attr('name', schema.name);
            case 'datetime': return $('<input>').attr('type', 'text').attr('name', schema.name).datetimepicker({ format:'YYYY-MM-DDThh:mm', });
            case 'date': return $('<input>').attr('type', 'text').attr('name', schema.name).datepicker({ dateFormat: 'yy-mm-dd' }).show();
            case 'enum': return createSelectFromEnum(schema).attr('name', schema.name);
            case 'object': return createSelectFromData(schema, value).attr('name', schema.name);
            default: throw schema.type + ' is not supported';
        }
    }

    function createSelectFromEnum(schema){
        console.log('createSelectFromEnum')
        var $select = $('<select>');
        schema.enum.forEach(function(v){
            $('<option>')
                .attr('value', v)
                .text(v)
                .appendTo($select);
        })
        return $select;
    }

    function createSelectFromData(schema, value){
        console.log(`createSelectFromData ${schema.title}`)
        var url = urlForModel(schema.$ref)
        var $select = $('<select>')
            .attr('data-url', url)
            .attr('data-class', schema.$ref);
        if (value)
            $select.attr('data-selected', value);
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
                createOption(schema.$ref, item).appendTo($select);
            });
            $select.val($select.attr('data-selected'));
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
            selectDataCache[url] = {
                status: 'pending',
                callbacks: [populateSelect]
            };
            RestApi6.get(url)
                .then(data => {
                    console.log('got data')
                    console.log(data)
                    selectDataCache[url].status = 'done';
                    selectDataCache[url].data = data;
                    // Call all queued callbacks
                    selectDataCache[url].callbacks.forEach(cb => cb(data));
                    selectDataCache[url].callbacks = [];
                });
        }
    }


    function addTableRow($table, schema, modelName, item){
        createTableRowItem($table, schema, modelName, '', item).appendTo($table);
    }

    function init(config) {
        baseUrl = config.restBaseUrl;
        schemaUrl = config.schemaUrl;
        onSchemaComplete = config.onSchemaComplete;
        loadSchema(schemaUrl, onSchemaComplete);
    }

    /**
     * Load API schema and build navigation
     */
    function loadSchema(url, onSchemaComplete) {
        RestApi6.get(url).then(dataSchema => {
            gSchema = dataSchema;

            for (const key in dataSchema) {
                if (key.startsWith('$')) continue;
                $('<li>')
                    .attr('data-class', key)
                    .text(key)
                    .appendTo($('nav ul.models'));
            }
            if (typeof onSchemaComplete === 'function') {
                onSchemaComplete(dataSchema);
            }
        });
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
        loadSchema: (url, handleSchema, onSchemaComplete) => loadSchema(url, handleSchema, onSchemaComplete),
        createTableForModel: (model) => createTableForModel(model),
    };
})();
