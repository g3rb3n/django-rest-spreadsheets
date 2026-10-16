/**
 * Account menu in the top right corner, like Google Sheets: a round avatar
 * that opens a card with log in / log out, both done in modal dialogs.
 */
const UserMenu = (() => {
    const ANONYMOUS_ICON = '\u{1F464}'; // 👤 bust in silhouette
    const COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#007b83', '#b06000', '#c2185b'];

    let config;
    let user;
    let $root;

    /**
     * A stable color per user, so the same person always gets the same avatar.
     */
    function colorFor(name) {
        let hash = 0;
        for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
        return COLORS[hash % COLORS.length];
    }

    function createAvatar(size) {
        const $avatar = $('<span>').addClass('avatar').addClass(size).attr('aria-hidden', 'true');
        if (user.authenticated) {
            $avatar.text(user.initial).css('background-color', colorFor(user.username));
        } else {
            $avatar.addClass('anonymous').text(ANONYMOUS_ICON);
        }
        return $avatar;
    }

    function render() {
        $root.empty().removeClass('open');
        const label = user.authenticated ? `Account: ${user.name}` : 'Account: not logged in';
        const $button = $('<button>')
            .addClass('avatar-button')
            .attr('type', 'button')
            .attr('title', user.authenticated ? user.name : 'Not logged in')
            .attr('aria-label', label)
            .attr('aria-haspopup', 'true')
            .attr('aria-expanded', 'false')
            .append(createAvatar('small'))
            .on('click', event => {
                event.stopPropagation();
                toggle();
            })
            .appendTo($root);

        const $panel = $('<div>').addClass('user-menu-panel').attr('role', 'menu').appendTo($root);
        createAvatar('large').appendTo($panel);
        if (user.authenticated) {
            $('<div>').addClass('name').text(user.name).appendTo($panel);
            if (user.username !== user.name)
                $('<div>').addClass('username').text(user.username).appendTo($panel);
            createMenuButton('Log out', openLogoutDialog).appendTo($panel);
        } else {
            $('<div>').addClass('name').text('Not logged in').appendTo($panel);
            createMenuButton('Log in', openLoginDialog).appendTo($panel);
        }
    }

    function createMenuButton(text, onClick) {
        return $('<button>')
            .addClass('menu-action')
            .attr('type', 'button')
            .attr('role', 'menuitem')
            .text(text)
            .on('click', () => {
                close();
                onClick();
            });
    }

    function toggle() {
        $root.hasClass('open') ? close() : open();
    }

    function open() {
        $root.addClass('open');
        $root.find('.avatar-button').attr('aria-expanded', 'true');
        $root.find('.menu-action').trigger('focus');
    }

    function close() {
        $root.removeClass('open');
        $root.find('.avatar-button').attr('aria-expanded', 'false');
    }

    /*
     * Dialogs
     */
    function createDialog(title, $body, submitText, onSubmit) {
        const $dialog = $('<dialog>').addClass('auth-dialog').appendTo('body');
        const $form = $('<form>').attr('novalidate', 'novalidate').appendTo($dialog);
        $('<h2>').text(title).appendTo($form);
        $form.append($body);
        $('<p>').addClass('form-error').attr('role', 'alert').appendTo($form);
        const $buttons = $('<div>').addClass('dialog-buttons').appendTo($form);
        $('<button>').attr('type', 'button').addClass('text').text('Cancel')
            .on('click', () => $dialog[0].close())
            .appendTo($buttons);
        const $submit = $('<button>').attr('type', 'submit').addClass('primary').text(submitText).appendTo($buttons);
        $form.on('submit', event => {
            event.preventDefault();
            clearFormErrors($form);
            $submit.prop('disabled', true);
            onSubmit($form)
                .then(() => $dialog[0].close())
                .catch(error => showFormErrors($form, error))
                .finally(() => $submit.prop('disabled', false));
        });
        // Remove on close (Cancel, Esc or success) so each open starts clean.
        $dialog.on('close', () => {
            $dialog.remove();
            $root.find('.avatar-button').trigger('focus');
        });
        $dialog[0].showModal();
        return $dialog;
    }

    function createField(name, label, type, autocomplete) {
        const id = `auth-${name}`;
        const $field = $('<div>').addClass('field');
        $('<label>').attr('for', id).text(label).appendTo($field);
        $('<input>')
            .attr({id, name, type, autocomplete, required: 'required'})
            .appendTo($field);
        $('<span>').addClass('field-error').appendTo($field);
        return $field;
    }

    function openLoginDialog() {
        const $body = $('<div>')
            .append(createField('username', config.usernameLabel || 'Username', 'text', 'username'))
            .append(createField('password', 'Password', 'password', 'current-password'));
        const $dialog = createDialog('Log in', $body, 'Log in', $form => {
            const data = {
                username: $form.find('[name=username]').val(),
                password: $form.find('[name=password]').val(),
            };
            return RestApi6.post(config.loginUrl, data).then(applyAuth);
        });
        $dialog.find('[name=username]').trigger('focus');
    }

    function openLogoutDialog() {
        const $body = $('<p>').text(`Log out of ${user.name}?`);
        createDialog('Log out', $body, 'Log out', () => RestApi6.post(config.logoutUrl, {}).then(applyAuth));
    }

    function clearFormErrors($form) {
        $form.find('.form-error, .field-error').text('');
        $form.find('.field').removeClass('error');
    }

    /**
     * Field errors (from Django's AuthenticationForm) under their input,
     * everything else above the buttons.
     */
    function showFormErrors($form, error) {
        console.error(error);
        const data = error && error.data;
        const general = [];
        if (data && typeof data == 'object') {
            for (const key in data) {
                const text = [].concat(data[key]).join(' ');
                const $field = $form.find(`[name='${key}']`).closest('.field');
                if ($field.length) {
                    $field.addClass('error').find('.field-error').text(text);
                } else {
                    general.push(text);
                }
            }
        } else if (error && error.status) {
            general.push(`Request failed (${error.status})`);
        } else {
            general.push(`Request failed: ${error && error.message || error}`);
        }
        $form.find('.form-error').text(general.join(' '));
    }

    /**
     * Take over the session from a login/logout response: the new user and
     * the rotated CSRF token that RestApi6 sends with every write.
     */
    function applyAuth(data) {
        user = data.user;
        const csrfElement = document.getElementById('drf_csrf');
        if (csrfElement && data.csrfToken) {
            const csrf = JSON.parse(csrfElement.textContent);
            csrf.csrfToken = data.csrfToken;
            csrfElement.textContent = JSON.stringify(csrf);
        }
        render();
        if (typeof config.onChange === 'function') config.onChange(user);
    }

    function init(options) {
        config = options;
        user = options.user;
        $root = $(options.container).addClass('user-menu');
        render();
        $(document).on('click', event => {
            if (!$(event.target).closest($root).length) close();
        });
        $(document).on('keydown', event => {
            if (event.key === 'Escape' && $root.hasClass('open')) {
                close();
                $root.find('.avatar-button').trigger('focus');
            }
        });
    }

    return {
        init: init,
        user: () => user,
    };
})();
