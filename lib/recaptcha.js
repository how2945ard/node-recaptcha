/*!
 * node-recaptcha
 * Copyright(c) 2010 Michael Hampton <mirhampt+github@gmail.com>
 * MIT Licensed
 */


global.RecaptchaError = function(errorCode) {
    this.message = errorCode;
    this.name = 'RecaptchaError';
    Error.captureStackTrace(this, RecaptchaError);
};
RecaptchaError.prototype = Object.create(Error.prototype);
RecaptchaError.prototype.constructor = RecaptchaError;

/**
 * Module dependencies.
 */

var http = require('http'),
    querystring = require('querystring'),
    BlueBird = require('bluebird');

/**
 * Constants.
 */

var API_HOST = 'www.google.com',
    API_END_POINT = '/recaptcha/api/verify',
    SCRIPT_SRC = API_HOST + '/recaptcha/api/challenge',
    NOSCRIPT_SRC = API_HOST + '/recaptcha/api/noscript';

/**
 * Initialize Recaptcha with given `public_key`, `private_key` and optionally
 * `data`.
 *
 * The `data` argument should have the following keys and values:
 *
 *   remoteip:  The IP of the client who submitted the form.
 *   challenge: The value of `recaptcha_challenge_field` from the Recaptcha
 *              form.
 *   response:  The value of `recaptcha_response_field` from the Recaptcha
 *              form.
 *
 * @param {String} public_key Your Recaptcha public key.
 * @param {String} private_key Your Recaptcha private key.
 * @param {Object} data The Recaptcha data to be verified.  See above for
 *                      format.  (optional)
 * @param {Boolean} secure Flag for using https connections to load client-facing things. (optional)
 * @api public
 */

var Recaptcha = exports.Recaptcha = function Recaptcha(public_key, private_key, data, secure) {
    this.public_key = public_key;
    this.private_key = private_key;
    if (typeof(data) == 'boolean') {
        this.data = undefined;
        this.is_secure = data;
    } else {
        this.data = data;
        this.is_secure = secure;
    }

    return this;
}

/**
 * Render the Recaptcha fields as HTML.
 *
 * If there was an error during `verify` and the selected Recaptcha theme
 * supports it, it will be displayed.
 *
 * @api public
 */

Recaptcha.prototype.toHTML = function() {
    var query_string = 'k=' + this.public_key;
    if (this.error_code) {
        query_string += '&error=' + this.error_code;
    }

    var script_src = (this.is_secure ? "https://" : "http://") + SCRIPT_SRC + '?' + query_string;
    var noscript_src = (this.is_secure ? "https://" : "http://") + NOSCRIPT_SRC + '?' + query_string;

    return '<script type="text/javascript" src="' + script_src + '"></script>' +
        '<noscript><iframe src="' + noscript_src + '" height="300" width="500" ' +
        'frameborder="0"></iframe><br><textarea name="recaptcha_challenge_field" ' +
        'rows="3" cols="40"></textarea><input type="hidden" ' +
        'name="recaptcha_response_field" value="manual_challenge"></noscript>';
};

/**
 * Verify the Recaptcha response.
 *
 * Example usage:
 *
 *     var recaptcha = new Recaptcha('PUBLIC_KEY', 'PRIVATE_KEY', data);
 *     recaptcha.verify(function(success, error_code) {
 *         if (success) {
 *             // data was valid.  Continue onward.
 *         }
 *         else {
 *             // data was invalid, redisplay the form using
 *             // recaptcha.toHTML().
 *         }
 *     });
 *
 * @param {Function} callback
 * @api public
 */

Recaptcha.prototype.verify = function() {
    var self = this;
    return new BlueBird(function(resolve, reject) {
        // See if we can declare this invalid without even contacting Recaptcha.
        if (typeof(self.data) === 'undefined') {
            self.error_code = 'verify-params-incorrect';
            return reject(new RecaptchaError('verify-params-incorrect'));
        }
        if (!('remoteip' in self.data &&
                'challenge' in self.data &&
                'response' in self.data)) {
            self.error_code = 'verify-params-incorrect';
            return reject(new RecaptchaError('verify-params-incorrect'));
        }
        if (self.data.response === '') {
            self.error_code = 'incorrect-captcha-sol';
            return reject(new RecaptchaError('incorrect-captcha-sol'));
        }

        // Add the private_key to the request.
        self.data['privatekey'] = self.private_key;
        var data_qs = querystring.stringify(self.data);

        var req_options = {
            host: API_HOST,
            path: API_END_POINT,
            port: 80,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': data_qs.length
            }
        };

        var request = http.request(req_options, function(response) {
            var body = '';

            response.on('error', function(err) {
                return reject(new RecaptchaError('recaptcha-not-reachable'));
            });

            response.on('data', function(chunk) {
                body += chunk;
            });

            response.on('end', function() {
                var success, error_code, parts;

                parts = body.split('\n');
                success = parts[0];
                error_code = parts[1];

                if (success !== 'true') {
                    self.error_code = error_code;
                    return reject(new RecaptchaError(error_code));
                }
                return resolve();
            });
        });
        request.write(data_qs, 'utf8');
        request.end();
    })
};