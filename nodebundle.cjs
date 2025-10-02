'use strict';

var path = require('path');

var ALWAYS_EMPTY = { br: true, r: true };
var AUTO_TILL_END = { e: true };
var OFFTAG_REGEX_G = /\^([#@\/\.\:a-z_\-\d~]*)([<\{\[](?:\\.|.)*?[>\}\]])?/g; //不含^
var OFFTAG_REGEX$1 = /\^([#@\/\.\:a-z_\-\d~]+)([<{](?:\\.|.)*?>)?/;
var OFFTAG_REGEX_TOKENIZE = /(\^[#@\/\.\:a-z_\-\d~]+)([<{](?:\\.|.)*?[>}])?/g; //含^
var OFFTAG_REGEX_SPLIT = /(\^[#@\/\.\:a-z_\-\d~]+)([<{](?:\\.|.)*?[>}])?/;
var HTMLTAG_REGEX_G = /(<(?:\\.|.)*?>)/g;
//export const OFFTAG_REGEX_G=/\^([a-z_]+[#@\/\.\:~a-z_\-\d]*)(\[(?:\\.|.)*?\])?/g //標記樣式
//export const OFFTAG_REGEX=/\^([a-z_]+[#@\/\.\:~a-z_\-\d]*)(\[(?:\\.|.)*?\])?/ //標記樣式
///export const NAMED_OFFTAG="([#@\\/\\.\\:~a-z_\\-\\d]*)(\\[(?:\\\\.|.)*?\\])?" //已知名稱的標記
//export const OFFTAG_REGEX_SPLIT=/(\^[a-z_]+[#@\/\.\:~a-z_\-\d]*)(\[(?:\\.|.)*?\])?/ //標記樣式
var QUOTEPREFIX = '\u001a', QUOTEPAT = /\u001a(\d+)/g; // 抽取字串的前綴，之後是序號
var OFFTAG_COMPACT_ATTR = /^([\da-z_:\-\.~]*)$/; //可以不包夾在 [] 的 id/link ，數字開頭，小寫及-.
var OFFTAG_NAME_ATTR = /([a-z_\:]+)(.*)/; //名稱可以含az_: ，但不可為數字
var OFFTAG_ATTRS = "(\\[(?:\\\\.|.)*?\\])?";
var OFFTAG_COMPACT_ID = /^([a-z\d]+[_a-z\d\-~\.]*)/; //縮式 id
var QSTRING_REGEX_G = /"((?:\\.|.)*?)"/g; //字串標式
var OFFTAG_LEADBYTE = '^';
var FROMTILL = /^(>\d+)?(<\d+)?(:[\-\d]+)?$/;
var PTK_FROMTILL = /^([a-z\.\d\-_]+\:)(>\d+)?(<\d+)?(:[\-\d]+)?$/;
var PTK_ACTION_FROMTILL = /^([a-z\.\d\-_]+\:)?([^<>\d:]+[^:<>]*)(>\d+)?(<\d+)?(:[\-\d]+)?$/;
var MIN_ABRIDGE = 8; //minimum token in abridge segment

var REGEX_IRE = /‵([\u3400-\u9FFF\uD800-\uDFFF\uE000-\ufadf]+)′/g;
var REGEX_CJK_PHRASE = /([\u3400-\u9FFF\uD800-\uDFFF\uE000-\ufadf]+)/g;
var isSurrogate = function (s) { return (s.codePointAt(0) || 0) > 0xffff; };
var isCJKChar = function (u) {
    if (typeof u == 'string')
        u = u.charCodeAt(0);
    return ((u >= 0x2e80 && u <= 0x2fd5)
        || (u >= 0x3041 && u <= 0x3096)
        || (u >= 0x30a1 && u <= 0x319f)
        || (u >= 0x3400 && u <= 0x9fff)
        || (u >= 0xd400 && u <= 0xdfff)
        || (u >= 0xe000 && u <= 0xfadf)
        || (u >= 0xc000 && u <= 0xd7ff));
};
var CJKRanges = {
    'BMP': [0x4e00, 0x9fa5],
    'SurrogageLeft': [0xD800, 0xDBFF],
    'SurrogageRight': [0xDC00, 0xDFFF],
    'ExtA': [0x3400, 0x4dff],
    'ExtB': [0x20000, 0x2A6FF],
    'ExtC': [0x2A700, 0x2B73F],
    'ExtD': [0x2B740, 0x2B81F],
    'ExtE': [0x2B820, 0x2CEAF],
    'ExtF': [0x2CEB0, 0x2EBE0],
    'ExtG': [0x30000, 0x3134F],
    'ExtH': [0x31350, 0x323AF],
    'ExtZ': [0xA0000, 0xD47FF]
};
var enumCJKRangeNames = function () { return Object.keys(CJKRanges); };
var getCJKRange = function (name) { return CJKRanges[name] || [0, 0]; };
var CJKRangeName = function (s) {
    var cp = 0;
    if (typeof s === 'string') {
        var code = parseInt(s, 16);
        if (!isNaN(code)) {
            cp = code;
        }
        else {
            cp = s.codePointAt(0) || 0;
        }
    }
    for (var rangename in CJKRanges) {
        var _a = CJKRanges[rangename], from = _a[0], to = _a[1];
        if (cp >= from && cp <= to)
            return rangename;
    }
};
var string2codePoint = function (str, snap) {
    if (!str)
        return 0;
    var cp = str.codePointAt(0) || 0;
    var n;
    if (cp >= 0x3400 && cp < 0x2ffff) {
        n = cp;
    }
    else {
        n = (parseInt(str, 16) || 0x4e00);
    }
    return snap ? n & 0x3ff80 : n;
};
var isPunc = function (str) {
    if (!str)
        return false;
    var cp = str.charCodeAt(0);
    // console.log(cp,str,full)
    return ((cp >= 0x3001 && cp <= 0x301f) || cp > 0xff00 || (cp >= 0xfe10 && cp <= 0xfe6b));
};
var trimPunc = function (str) {
    return str.replace(/^[『「！。，：？]+/, '').replace(/[」？』。！：）｝〕；，]+$/, '');
};
var removePunc = function (str) {
    return str.replace(/[！。、：；，？！（）《》｛｝〔〕『』「」]/g, '');
};
//EMEDITOR highlight \^([#@\/\.\:a-z_\-\d~]+)([<\(「『〔（︹︵︷【︻《〈︽︿﹁﹃﹙﹝‘“〝](?:\\.|.)*?[>\)」』〕）︺︶︸】︼》〉︾﹀﹂』﹚﹞’”〞])?
var openBrackets = "<{[(｛「『〔（︹︵︷【︻《〈︽︿﹁﹃﹙﹝﹛‘“〝‵";
var closeBrackets = ">}])｝」』〕）︺︶︸】︼》〉︾﹀﹂﹄﹚﹞﹜’”〞′";
var closeBracketOf = function (ch) {
    if (!ch)
        return '';
    var at = openBrackets.indexOf(ch.slice(0, 1));
    if (~at)
        return closeBrackets[at];
    return '';
};
var removeBracket = function (str) {
    var closebracket = closeBracketOf(str);
    if (closebracket && str.slice(str.length - 1) == closebracket) {
        return str.slice(1, str.length - 1);
    }
    return str;
};
var cjkPhrases = function (str) {
    var out = [];
    str.replace(/([\u2e80-\u2fd5\u3400-\u9fff\ud800-\udfff\ue000-\ufad9]+)/g, function (m, m1) {
        out.push(m1);
    });
    return out;
};
var cjkSplitPuncs = function (str) {
    var out = [];
    var prev = 0;
    str.replace(/([\u3001-\u301f\uff00-\ufffc]+)/g, function (m, m1, idx) {
        out.push(str.slice(prev, idx));
        out.push(m1);
        prev = idx + m1.length;
    });
    out.push(str.slice(prev));
    return out;
};
var extractAuthor = function (arr) {
    var out = [];
    if (typeof arr == 'string')
        arr = [arr];
    arr.forEach(function (str) { return str.replace(/．([\u3400-\u9fff\ud800-\udfff]{2,10})[〈《]/g, function (m, m1) { return out.push(m1); }); });
    return out;
};
var extractBook = function (arr) {
    var out = [];
    if (typeof arr == 'string')
        arr = [arr];
    arr.forEach(function (str) { return str.replace(/[〈《]([\u3400-\u9fff\ud800-\udfff]{2,30})/g, function (m, m1) { return out.push(m1); }); });
    return out;
};
var replaceAuthor = function (str, cb) { return str.replace(/(．)([\u3400-\u9fff\ud800-\udfff]{2,10})([〈《])/g, function (m, m1, m2, m3) { return cb(m1, m2, m3); }); };
var replaceBook = function (str, cb) { return str.replace(/([〈《])([\u3400-\u9fff\ud800-\udfff]{2,30})/g, function (m, m1, m2, m3) { return cb(m1, m2, ''); }); };
var textlength = function (str) {
    return str.replace(/\^[a-z:\d\.\-@#]+/g, '').replace(/<[^>]+/g, '').length;
};
var VerticalPuncs = {
    '「': '﹁', '」': '﹂',
    '『': '﹃', '』': '﹄',
};
var toVerticalPunc = function (punc) {
    return VerticalPuncs[punc] || punc;
};
var breakChineseSentence = function (line, opts) {
    if (opts === void 0) { opts = {}; }
    var max = opts.threshold || 22;
    var mid = opts.threshold || 14;
    var min = opts.threshold || 6;
    var thres = 0, t = '';
    var phrases = cjkSplitPuncs(line);
    var out = [];
    for (var i = 0; i < phrases.length / 2; i++) {
        var nonpunc = phrases[i * 2];
        var punc = phrases[i * 2 + 1] || '';
        var strongbreak = punc.match(/[。！？]/) || nonpunc.slice(0, 2) == '^k'; //「『﹁﹃‘“〝‵
        var nextstrongbreak = (phrases[(i + 1) * 2 + 1] || '').match(/[。！？]/);
        thres += textlength(nonpunc);
        t += nonpunc + punc;
        if (t && (thres > max || (thres > mid && !nextstrongbreak) || (thres > min && strongbreak))) {
            out.push(t);
            t = '';
            thres = 0;
        }
    }
    t && out.push(t);
    //move open tag to next line
    var out2 = [];
    var lead = '';
    for (var i = 0; i < out.length; i++) {
        var m = out[i].match(/([（《「『︵｛︷〔︹【︻︽〈︿﹃﹙﹛﹝‘“〝‵]+)$/);
        if (m) {
            out2.push(lead + out[i].slice(0, out[i].length - m[1].length));
            lead = m[1];
        }
        else {
            out2.push(lead + out[i]);
            lead = '';
        }
    }
    if (lead && out2.length)
        out2[out2.length - 1] += lead;
    return out2.join('\n')
        .replace(/\n(\^[jkf][#a-z\d@:\-]+)([：；，、。！？」』）〕】》]*)/g, function (m, m1, punc) { return m1 + (punc || '') + '\n'; })
        .replace(/\n+/g, '\n').trimEnd(); //remove tailing \n and blanks
};
var extractIDS = function (line) {
    var out = [];
    line.replace(/([\u2ff0-\u2fff][\u2ff0-\u2fff\u3400-\u9fff\ud800-\udfff]{2,7})/g, function (m, m1) {
        out.push(m1);
    });
    return out;
};
var isWordChar = function (cp) {
    return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)
        || (cp >= 0xc0 && cp <= 0x2af) || (cp >= 0x370 && cp < 0x10ff) || (cp >= 0x1E00 && cp < 0x1fff);
};
var sentenceFromRange = function (str, pos, func) {
    if (func === void 0) { func = isCJKChar; }
    var start = pos, end = pos;
    while (start > 0) {
        var cp = str.charCodeAt(start);
        if (!func(cp)) {
            start++;
            break;
        }
        else
            start--;
    }
    while (end < str.length) {
        var cp = str.charCodeAt(end);
        if (func(cp))
            end++;
        else
            break;
    }
    var s = str.slice(start, end);
    while (s.charAt(0) == ' ') {
        s = s.slice(start + 1);
        start++;
    }
    var p = (pos - start >= 0 ? pos - start : 0);
    return [s, p];
};
var sentencePosfromSelection = function (oritext) {
    var _a;
    var sel = document.getSelection();
    var range = sel.getRangeAt(0);
    var _b = sentenceFromRange(oritext || sel.anchorNode.data, range.startOffset), sentence = _b[0], pos = _b[1];
    if (!sentence) {
        //try sanskrit/english
        _a = sentenceFromRange(oritext || sel.anchorNode.data, range.startOffset, isWordChar), sentence = _a[0], pos = _a[1];
    }
    return [sentence, pos, range.endOffset - range.startOffset];
};

var forEachUTF32 = function (str, cb) {
    var i = 0;
    while (i < str.length) {
        var code = str.codePointAt(i) || 0;
        var ch = String.fromCodePoint(code);
        cb(ch, i, str);
        i++;
        if (code > 0xffff)
            i++;
    }
};
var substrUTF32 = function (str, from, n) {
    if (!str || !n || n < 0)
        return '';
    var i = from;
    while (n > 0 && i < str.length) {
        if (str.codePointAt(i) > 0xffff) {
            i++;
        }
        n--;
        i++;
    }
    return str.slice(from, i);
};
var splitUTF32 = function (str) {
    if (!str) {
        var empty = [];
        return empty;
    }
    var i = 0;
    var out = [];
    while (i < str.length) {
        var code = str.codePointAt(i) || 0;
        out.push(code);
        i++;
        if (code > 0xffff)
            i++;
    }
    return out;
};
var splitUTF32Char = function (str) { return splitUTF32(str).map(function (cp) { return String.fromCodePoint(cp); }); };
var codePointLength = function (str) { return splitUTF32(str).length; };
var StringByteLength = function (str) { return new Blob([str]).size; };
var UnicodeBlock = function (n) {
    if (!n)
        return '';
    var cp = (typeof n == 'string') ? n.codePointAt(0) : n;
    if (cp < 0x80)
        return '半形 ascii';
    else if (cp < 0x400)
        return '2位元拉丁字母 2b Latin';
    else if (cp < 0x900)
        return '其他 Miscellaneous';
    else if (cp < 0xd80)
        return '印度 Indic scripts';
    else if (cp < 0xdf0)
        return '斯里兰卡Sinhala';
    else if (cp < 0xe80)
        return '泰 Thai';
    else if (cp < 0xf00)
        return '老挝 Lao';
    else if (cp < 0x1000)
        return '藏 Tibet';
    else if (cp < 0x1100)
        return '缅 Myanmar';
    else if (cp < 0x1200)
        return '韩 Korean';
    else if (cp < 0x1780)
        return '其他 Miscellaneous';
    else if (cp < 0x1800)
        return '柬埔寨 Khemar';
    else if (cp < 0x18D0)
        return '蒙 Mongolian';
    else if (cp < 0x2000)
        return '其他字母 Alphabets';
    else if (cp < 0x2060)
        return '标点 Puncuations';
    else if (cp < 0x2E80)
        return '其他 Miscellaneous';
    else if (cp < 0x2FF0)
        return '部首 Radical';
    else if (cp < 0x3000)
        return '组字符 IDC';
    else if (cp < 0x3040)
        return '日式标点 Japanese Puncuation';
    else if (cp < 0x3100)
        return '日文 Japanese';
    else if (cp < 0x3140)
        return '注音 Bopomofo';
    else if (cp < 0x31D0)
        return '韩 Korean';
    else if (cp < 0x31F0)
        return '笔划 Strokes';
    else if (cp < 0x3400)
        return '机种依存文字 Kisyu-izon-moji';
    else if (cp < 0x4E00)
        return '扩A';
    else if (cp < 0xA000)
        return '基本汉字';
    else if (cp < 0xA4D0)
        return '彝 Yi';
    else if (cp < 0xAC00)
        return '其他 Miscellaneous';
    else if (cp < 0xE000)
        return '韩 Korean';
    else if (cp < 0xFAE0)
        return '造字区 Private Use Area';
    else if (cp < 0xFF00)
        return '其他 Miscellaneous';
    else if (cp < 0x10000)
        return '全形 Full Width';
    else if (cp < 0x20000)
        return '其他 Miscellaneous';
    else if (cp < 0x2A7D0)
        return '扩B';
    else if (cp < 0x2B7A0)
        return '扩C';
    else if (cp < 0x2B880)
        return '扩D';
    else if (cp < 0x2CF10)
        return '扩E';
    else if (cp < 0x2FFFF)
        return '扩F';
    else if (cp < 0x40000)
        return '扩G';
};

var TOKENIZE_REGEX = /(([\u0021-\u1fff]+)|([\u2000-\u2fff\u3001-\uffff]+))/g;
var CJKWord_Reg = /([\u2e80-\u2fd5\u3400-\u9fff\ud400-\udfff\ue000\uffff]+)/g;
var CJKWordEnd_Reg = /([\u2e80-\u2fd5\u3400-\u9fff\ud400-\udfff\ue000\ufadf]+$)/;
var CJKWordBegin_Reg = /(^[\u2e80-\u2fd5\u3400-\u9fff\ud400-\udfff\ue000\uffff]+)/;
var Word_tailspace_Reg = /([\dA-Za-z\u1000-\u1049\u0900-\u0963\u96f\u00c0-\u02af\u1e00-\u1faf][\dA-Za-z\u1000-\u1049\u0900-\u0963\u96f\u00c0-\u02af\u1e00-\u1faf\d]* ?)/g;
var MAXPHRASELEN = 16;
var EXCERPT_PAGESIZE = 5;

exports.TokenType = void 0;
(function (TokenType) {
    TokenType[TokenType["UNSEARCHABLE"] = 1] = "UNSEARCHABLE";
    TokenType[TokenType["OFFTAG"] = 3] = "OFFTAG";
    TokenType[TokenType["SEARCHABLE"] = 16] = "SEARCHABLE";
    TokenType[TokenType["ROMANIZE"] = 32] = "ROMANIZE";
    TokenType[TokenType["MYANMAR"] = 33] = "MYANMAR";
    TokenType[TokenType["CJK"] = 48] = "CJK";
    TokenType[TokenType["CJK_BMP"] = 49] = "CJK_BMP";
    TokenType[TokenType["CJK_SURROGATE"] = 50] = "CJK_SURROGATE";
})(exports.TokenType || (exports.TokenType = {}));
function Token(text, choff, tkoff, type, line) {
    return { text: text, choff: choff, tkoff: tkoff, type: type };
}
var tokenize$1 = function (text) {
    var out = [];
    var i = 0, tkoff = 0;
    if (typeof text !== 'string')
        return [];
    var _loop_1 = function () {
        var code = text.codePointAt(i) || 0;
        if (code > 0xffff) {
            var sur = String.fromCodePoint(code);
            out.push(Token(sur, i, tkoff, exports.TokenType.CJK_SURROGATE));
            tkoff++;
            i += 2;
            return "continue";
        }
        else if (code >= 0x2000 && code <= 0xffff) {
            var tt = (code >= 2e80 && code <= 0x2fff) //radical
                || (code >= 0x3041 && code <= 0x9fff) //0xbmp
                || (code >= 0xd400 && code < 0xdfff) //surrogates
                || (code >= 0xe000 && code < 0xfadf) ? exports.TokenType.CJK_BMP : exports.TokenType.UNSEARCHABLE;
            out.push(Token(text[i], i, tkoff, tt));
            if (tt !== exports.TokenType.UNSEARCHABLE)
                tkoff++;
            i++;
            return "continue";
        }
        //space or alpha number
        var s = '', prev = 0;
        var j = i;
        while (j < text.length && code < 0x2000) {
            s += text[j];
            code = text.codePointAt(++j) || 0;
        }
        s.replace(Word_tailspace_Reg, function (m, m1, offset) {
            if (offset > prev) {
                out.push(Token(s.substring(prev, offset), prev + i, tkoff, exports.TokenType.UNSEARCHABLE));
            }
            while (s[offset] == ' ')
                offset++;
            out.push(Token(m1, i + offset, tkoff, exports.TokenType.ROMANIZE));
            tkoff++;
            prev = offset + m.length;
            return '';
        });
        if (prev < s.length)
            out.push(Token(s.substring(prev), prev + i, tkoff, exports.TokenType.UNSEARCHABLE));
        i = j;
    };
    while (i < text.length) {
        _loop_1();
    }
    return out;
};

var jsonify = function (almostJson) {
    try {
        return JSON.parse(almostJson);
    }
    catch (e) {
        almostJson = almostJson.replace(/([a-zA-Z0-9_$]+\s*):/g, '"$1":').replace(/'([^']+?)'([\s,\]\}])/g, '"$1"$2');
        return JSON.parse(almostJson);
    }
};
var chars = {
    '[': ']',
    '{': '}'
};
var any = function (iteree, iterator) {
    var result;
    for (var i = 0; i < iteree.length; i++) {
        result = iterator(iteree[i], i, iteree);
        if (result) {
            break;
        }
    }
    return result;
};
var extractObject = function (str) {
    if (str.charAt(0) !== '{')
        return ["", 0];
    var startIndex = 0;
    var openingChar = str[startIndex];
    var closingChar = chars[openingChar];
    var endIndex = -1;
    var count = 0;
    str = str.substring(startIndex);
    any(str, function (letter, i) {
        if (letter === openingChar) {
            count++;
        }
        else if (letter === closingChar) {
            count--;
        }
        if (!count) {
            endIndex = i;
            return true;
        }
    });
    if (endIndex === -1) {
        return ['', 0];
    }
    var obj = str.substring(0, endIndex + 1);
    return [obj, endIndex + 1];
};
var extract = function (str) {
    var startIndex = str.search(/[\{\[]/);
    if (startIndex === -1) {
        return null;
    }
    var openingChar = str[startIndex];
    var closingChar = chars[openingChar];
    var endIndex = -1;
    var count = 0;
    str = str.substring(startIndex);
    any(str, function (letter, i) {
        if (letter === openingChar) {
            count++;
        }
        else if (letter === closingChar) {
            count--;
        }
        if (!count) {
            endIndex = i;
            return true;
        }
    });
    if (endIndex === -1) {
        return null;
    }
    var obj = str.substring(0, endIndex + 1);
    return obj;
};
var extractJSON = function (str) {
    var result;
    var objects = [];
    while ((result = extract(str)) !== null) {
        try {
            var obj = jsonify(result);
            objects.push(obj);
        }
        catch (e) {
            // Do nothing
        }
        str = str.replace(result, '');
    }
    return objects;
};

var parseCompactAttr = function (str) {
    var out = {}, arr = str.split(/([@#~])/);
    while (arr.length) {
        var v = arr.shift();
        if (v === '~')
            out['to'] = arr.shift();
        else if (v === '@')
            out['ln'] = arr.shift(); // a pointer
        else if (v === '#') {
            v = arr.shift() || '';
            var m = v.match(OFFTAG_COMPACT_ID); //id with numeric leading may omit #
            if (m)
                out.id = m[1];
        }
        else {
            out.id = v;
        }
    }
    return out;
};
var parseAttributes = function (rawAttrs, compactAttr) {
    var quotes = Array(); //字串抽出到quotes，方便以空白為拆分單元,
    var getqstr = function (str, withq) {
        if (withq === void 0) { withq = false; }
        return str.replace(QUOTEPAT, function (m, qc) {
            return (withq ? '"' : '') + quotes[parseInt(qc)] + (withq ? '"' : '');
        });
    };
    var rawattr = rawAttrs ? rawAttrs.slice(1, rawAttrs.length - 1).replace(QSTRING_REGEX_G, function (m, m1) {
        quotes.push(m1);
        return QUOTEPREFIX + (quotes.length - 1);
    }) : '';
    var attrarr = rawattr.split(/( +)/), attrs = {}; //至少一個空白做為屬性分隔
    if (compactAttr)
        Object.assign(attrs, parseCompactAttr(compactAttr));
    while (attrarr.length) {
        var it = attrarr.shift() || '';
        var eq = -1, key = '';
        if (it[0] == '~' || it[0] == '#' || it[0] == '@') { //short form
            key = it[0];
            if (key == '#')
                key = 'id';
            if (key == '@')
                key = 'ln';
            if (key == '~')
                key = 'to';
            eq = (it[1] == '=') ? 1 : 0;
        }
        else {
            eq = it.indexOf('=');
            if (eq > 0)
                key = it.slice(0, eq);
        }
        if (eq > -1) {
            attrs[key] = getqstr(it.slice(eq + 1));
            if (attrarr.length && !attrarr[0].trim())
                attrarr.shift(); //drop the following space
        }
        else {
            if (it)
                attrs[it] = true;
        }
    }
    return attrs;
};
// 剖析一個offtag,  ('a7[k=1]') 等效於 ('a7','[k=1]')
// 接受 <a=33 b=44>(舊格式) 或 {a:33,b:44}
var parseOfftag = function (raw, rawAttrs) {
    var attrs = {};
    if (raw[0] == OFFTAG_LEADBYTE)
        raw = raw.slice(1);
    if (rawAttrs) {
        if (rawAttrs[0] !== '<' && rawAttrs[0] !== '{') {
            //attrs.innertext=removeBracket(rawAttrs);
            rawAttrs = '';
        }
        else {
            var at = raw.indexOf('<');
            var at2 = raw.indexOf('{');
            if (at2 > 0) {
                rawAttrs = raw.slice(at);
                raw = raw.slice(0, at);
            }
            else if (at > 0) {
                rawAttrs = raw.slice(at);
                raw = raw.slice(0, at);
            }
        }
    }
    var o = raw.match(OFFTAG_NAME_ATTR);
    if (!o) {
        console.log("\ninvalid tag, raw", raw, 'attr', rawAttrs);
        return [raw, {}];
    }
    else {
        o[0]; var tagName = o[1], compactAttr = o[2];
        if (rawAttrs && rawAttrs.charAt(0) == '{') {
            var attrs2 = jsonify(rawAttrs);
            attrs = parseAttributes('', compactAttr);
            for (var key in attrs2) {
                attrs[key] = attrs2[key];
            }
        }
        else {
            if (compactAttr || rawAttrs)
                attrs = parseAttributes(rawAttrs, compactAttr);
        }
        return [tagName, attrs];
    }
};
var resolveEnd = function (raw, plain, tags) {
    //文字型的範圍，已知原字串終點，計算正字串長度(utf16)
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var j = i;
        if (tag.end > tag.start && !tag.width) { //已知 rawtext 座標，換算回plaintext座標
            while (j < tags.length && tag.end > tags[j].start)
                j++;
            if ((j < tags.length && tags[j].start > tag.end) || j == tags.length)
                j--;
            var closest = (j < tags.length) ? tags[j] : tag; //最接近終點的 tag
            tag.width = tag.end - closest.start; //從closest 到本tag終點之間的的正字串距離 即 原字串距離
            tag.width += closest.choff - tag.choff; //closest 和 tag 正字串距離
        }
    }
    //數字型的範圍，已知正字串長度(offtext 標記提供以 utf32為單位)，計算原字串終點
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        if (tag.width && tag.end == tag.start) { //已知width ，計算end
            //轉換utf32 個數為 utf16 個數
            tag.width = substrUTF32(plain, tag.choff, tag.width).length;
            var j = i + 1;
            while (j < tags.length && tag.choff + tag.width > tags[j].choff)
                j++;
            if ((j < tags.length && tags[j].choff > tag.choff + tag.width) || j == tags.length)
                j--;
            var closest = (j < tags.length) ? tags[j] : tag;
            //最接近終點的 tag，再無其他tag ，即正字串原字串定位相同
            if (closest === tag) {
                tag.end += tag.width; //到終點前無其他tag，直接加上 width 即可
            }
            else { //
                tag.end = closest.start //取 closest 的原字串位置 加上
                    + (tag.choff + tag.width - closest.choff);
                //tag.choff+tag.width 正字串長度 - closest 的正字串座標 即 正字串個數=原字串個數
            }
        }
    }
};
var stripOfftag = function (str) { return str.replace(OFFTAG_REGEX_G, ''); };
var parseOfftext = function (str, line) {
    if (line === void 0) { line = 0; }
    if (!str || str.indexOf('^') == -1)
        return [str || '', []];
    var tags = Array();
    var choff = 0, prevoff = 0; // choff : offset to plain text
    var text = str.replace(OFFTAG_REGEX_G, function (m, rawName, rawAttrs, offset) {
        if (!rawName) { //may be transclusion
            if (rawAttrs && rawAttrs.startsWith('[')) {
                var transclusiontag = { name: '', offset: offset, aoffset: offset + 1, attrs: {}, line: line, choff: choff, width: 0, start: offset + 2, end: offset + rawAttrs.length, active: false };
                tags.push(transclusiontag);
                var innertext = removeBracket(rawAttrs);
                return innertext;
            }
            return '';
        }
        var _a = parseOfftag(rawName, rawAttrs), tagName = _a[0], attrs = _a[1];
        var width = 0;
        var start = offset + m.length, end = start; //文字開始及結束
        var endch = attrs['~'];
        if (endch) { //數字型終點
            if (isNaN(parseInt(endch))) { //終字
                width = 0;
                var repeat = 0;
                var m_1 = endch.match(/\+(\d+)$/);
                if (m_1) {
                    endch = endch.slice(0, endch.length - m_1.length);
                    repeat = parseInt(m_1[1]);
                }
                var at = str.indexOf(endch, start);
                while (~at && repeat) {
                    at = str.indexOf(endch, at + 1);
                    repeat--;
                }
                if (~at) {
                    end = at + endch.length;
                    delete attrs['~']; //resolved, remove it
                }
            }
            else { //往後吃w色字，不含其他標記，一對surrogate 算一字
                width = parseInt(endch); //這是utf32 的個數
            }
            //tag.end resolveEnd 才知道
        }
        else { //以括號指定區間
            var closebracket = closeBracketOf(str.charAt(start));
            if (closebracket) { //offtag 屬性不能帶括號
                var at = str.indexOf(closebracket, start + 1);
                if (~at)
                    end = at + closebracket.length; //包括括號
            }
        }
        var aoffset = offset + rawName.length + 1;
        choff += offset - prevoff; //目前文字座標，做為標記的起點
        var offtag = { name: tagName, offset: offset, aoffset: aoffset, attrs: attrs, line: line, choff: choff, width: width, start: start, end: end, active: false };
        tags.push(offtag);
        choff -= m.length;
        prevoff = offset;
        return '';
    });
    resolveEnd(str, text, tags);
    //need one concreate char to hold tag at the end
    if (tags.length && tags[tags.length - 1].choff >= text.length) {
        text += ' ';
    }
    return [text, tags];
};
var updateOfftext = function (rawtext, tag, newtag) {
    for (var n in newtag.attrs) {
        if (newtag.attrs[n] != tag.attrs[n]) { //parse Number no need to update
            var newvalue = typeof newtag.attrs[n] !== 'string' ? JSON.stringify(newtag.attrs[n]) : newtag.attrs[n];
            if (newvalue.indexOf(' ') > 0) {
                newvalue = '"' + newvalue + '"';
            }
            var regex = new RegExp('\\b' + n + ' *= *"?' + tag.attrs[n] + '"?');
            rawtext = rawtext.replace(regex, n + '=' + newvalue);
        }
    }
    return rawtext;
};
var Offtext = /** @class */ (function () {
    function Offtext(raw, line) {
        if (line === void 0) { line = 0; }
        this.raw = raw;
        //let plain,tags;
        var _a = parseOfftext(raw, line), plain = _a[0], tags = _a[1];
        this.plain = plain;
        this.tags = tags;
    }
    Offtext.prototype.getTag = function (ntag) {
        return this.tags[ntag];
    };
    Offtext.prototype.tagText = function (tag, raw) {
        if (raw === void 0) { raw = false; }
        if (typeof tag == 'number')
            tag = this.tags[tag];
        if (!tag)
            return '';
        return raw ? this.raw.slice(tag.start, tag.end) : this.plain.slice(tag.choff, tag.choff + tag.width);
    };
    Offtext.prototype.tagRawText = function (tag) {
        return this.tagText(tag, true);
    };
    return Offtext;
}());
var packOfftagAttrs = function (attrs, opts) {
    if (opts === void 0) { opts = { omit: Boolean, allowEmpty: Boolean }; }
    var out = '';
    var omit = opts.omit || false;
    var allowEmpty = opts.allowEmpty || false;
    for (var key in attrs) {
        if (omit && omit[key])
            continue;
        var v = attrs[key];
        if (v.indexOf(" ") > -1 || (!v && (opts === null || opts === void 0 ? void 0 : opts.allowEmpty))) {
            v = '"' + v.replace(/\"/g, '\\"') + '"';
        }
        if (out)
            out += ' ';
        if (attrs[key] && !allowEmpty)
            out += key + '=' + v;
    }
    return out.trim();
};
//將offtext剖為處理單元, 可直接送給indexer或繪製處理，offtag不searchable，故不會增加 tkoff
//Token 的text全部接起來，會是輸入的str ，一個byte 不差
var tokenizeOfftext = function (str) {
    var out = Array();
    var tkoff = 0, choff = 0;
    var addSnippet = function (snippet) {
        if (!snippet)
            return;
        var tokens = tokenize$1(snippet) || [];
        out = out.concat(tokens);
        if (tokens.length) {
            var tkcount = out[out.length - 1].tkoff //此snippet 有多少個token?
                + (out[out.length - 1].type >= exports.TokenType.SEARCHABLE ? 1 : 0);
            //如果最後一個token 是SEARCHABLE ，則 tkcount要加一
            tokens.forEach(function (it) {
                it.choff += choff;
                it.tkoff += tkoff;
            });
            tkoff += tkcount;
        }
    };
    str.replace(OFFTAG_REGEX_TOKENIZE, function (m, rawName, rawAttrs, offset) {
        var prevtext = str.slice(choff, offset);
        addSnippet(prevtext); //到上一個offtag 之間的文字
        var thetag = str.slice(offset, offset + m.length);
        //將tag及attributes原封不動作為一個token，之後有需要再parse它
        var tk = new Token(thetag, offset, tkoff, exports.TokenType.OFFTAG);
        out.push(tk);
        choff = offset + m.length; //文字開始之後 , offtext/parser.ts::parseOfftext , 附屬於tag 的文字，視為正常字
    });
    addSnippet(str.slice(choff)); //最後一段文字
    return out;
};
//這是一個^f1句子   
//這是兩個^f2【二】句子 
var sentencize = function (linetext, line) {
    if (linetext === void 0) { linetext = ''; }
    var tokens = tokenizeOfftext(linetext);
    var sentences = Array();
    var prevcjk = -1; //避免被短標記破開
    for (var i = 0; i < tokens.length; i++) {
        var tk = tokens[i];
        if (tk.type > exports.TokenType.SEARCHABLE) {
            if (i && sentences.length && tk.type & exports.TokenType.CJK && prevcjk > -1) {
                tokens[prevcjk].text += tk.text;
            }
            else {
                tk.line = line;
                sentences.push(tk);
                if (tk.type & exports.TokenType.CJK)
                    prevcjk = i;
                else
                    prevcjk = -1;
            }
        }
        else {
            if (!tk.text.match(OFFTAG_REGEX$1))
                prevcjk = -1; //如果被破開，就不會接繼到最後一個 cjk token
            sentences.push(tk);
        }
    }
    return sentences;
};
var eatofftag = function (str) {
    var thetag = '', p = 0;
    var ch = str.charAt(0);
    if (ch == '{') {
        var _a = extractObject(str); _a[0]; var len = _a[1];
        return str.slice(0, len);
    }
    while (thetag.length < 128 && ch && p < str.length) {
        var cp = str.charCodeAt(p) || 0;
        if ((cp > 0x2d && cp <= 0x3b) || (cp >= 0x61 && cp <= 0x7a)
            || cp == 0x40 || cp == 0x23 || cp == 0x5f || cp == 0x7e) { // -./0123456789:;_#@   a-z ~  
            thetag += ch;
            p++;
        }
        else {
            break;
        }
        ch = str.charAt(p);
    }
    return thetag;
};
var eatbracket = function (str, breaker, stop) {
    if (breaker === void 0) { breaker = '\t'; }
    if (stop === void 0) { stop = null; }
    var out = '', p = 0;
    var ch = str.charAt(p);
    var closebracket = closeBracketOf(ch);
    if (!stop)
        stop = [];
    while (closebracket) {
        var at2 = str.indexOf(closebracket, p + 1);
        if (at2 == -1) { // no matching , wrong tag, quit
            break;
        }
        out += str.slice(p, at2 + 1);
        if (breaker)
            out += breaker;
        p = at2 + 1;
        if (~stop.indexOf(ch))
            break;
        ch = str.charAt(p);
        closebracket = closeBracketOf(ch);
    }
    return out.slice(0, out.length - breaker.length);
};
var unitize = function (str) {
    if (!str)
        return [];
    var out = ''.split('');
    var prev = 0;
    var at = str.indexOf('^', prev);
    // make sure sum of items' length == str.length
    while (~at) {
        var p = at + 1; //temporary pointer 
        var ch = str.charAt(p);
        if (ch == '^') { //escaping
            at = str.indexOf('^', p + 1);
            continue;
        }
        var prevtext = '';
        var offtag = eatofftag(str.slice(p));
        prevtext = str.slice(prev, p - 1);
        if (prevtext)
            out.push(prevtext);
        var brackets = eatbracket(str.slice(p + offtag.length), '', ['[', '{', '<']);
        out.push('^' + str.slice(p, p + brackets.length + offtag.length));
        p += offtag.length;
        prev = brackets.length + p;
        at = str.indexOf('^', prev);
    }
    if (str.length > prev) {
        var s = str.slice(prev);
        if (s)
            out.push(s);
    }
    return out;
};
var offTagType = function (str) {
    var offtag = eatofftag(str);
    str = str.slice(offtag.length);
    var ch = str.charAt(0);
    if (closeBracketOf(ch)) {
        if (ch === '[') {
            return [str.slice(1, str.length - 1), "transclusion", offtag];
        }
        else if (ch === '<' && !offtag.length) {
            return [str, "html", offtag];
        }
        else {
            if (offtag.charAt(0) == '{') { //json as offtag
                try {
                    var r = jsonify(offtag);
                    return [offtag, 'offtext', ""];
                }
                catch (e) {
                    return [str, 'unknown', offtag];
                }
            }
            return [str, "offtext", offtag]; //just remove ^, keep bracket
        }
    }
    else {
        if (!str)
            return ["", 'offtext', offtag]; //without brackets
        try {
            var r = jsonify(offtag);
            return [str, 'offtext', offtag];
        }
        catch (e) {
            return [str, 'unknown', offtag];
        }
    }
};
//  page 
//  page.line    // line must be number
//  page@book
//  page@book.lineoff 
//  page.line@book
var parsePageBookLine = function (addr) {
    var lineoff = 0;
    var m = addr.match(/\.(\d+)/);
    if (m) {
        lineoff = parseInt(m[1]);
        addr = addr.replace(m[0], '');
    }
    var _a = addr.split('@'), page = _a[0], book = _a[1];
    return [page, book, lineoff];
};
//parse a complete transclusion with chinese
var parseTransclusion = function (str) {
    if (str.startsWith('^'))
        str = str.slice(1);
    var tag = '', innertext = str;
    if (!str.indexOf('[')) {
        tag = eatofftag(str);
        innertext = removeBracket(str.slice(tag.length));
    }
    var at = innertext.indexOf('|');
    var caption = innertext;
    if (at > 0) {
        caption = innertext.slice(0, at);
        innertext = innertext.slice(at + 1);
    }
    return [tag, innertext, caption];
};

var runCriterion = function (ptk, name, c) {
    // const typedef=ptk.columns[name]
    console.log('run', name);
};
var parseCriteria = function (cstr) {
    var query = [];
    var criteria = cstr.split(';');
    for (var i = 0; i < criteria.length; i++) {
        var _a = criteria[i].split('='), name_1 = _a[0], tofind = _a[1];
        query.push({ name: name_1, tofind: tofind });
    }
    return query;
};

var bsearchNumber = function (arr, obj) {
    var low = 0, high = arr.length - 1, mid;
    while (low < high) {
        mid = (low + high) >> 1;
        if (arr[mid] === obj) {
            while (mid > -1 && arr[mid - 1] === obj)
                mid--; //值重覆的元素，回逆到第一個
            return mid;
        }
        (arr[mid] < obj) ? low = mid + 1 : high = mid;
    }
    return low;
};
var bsearch = function (arr, obj) {
    var low = 0, high = arr.length - 1, mid;
    while (low < high) {
        mid = (low + high) >> 1;
        if (arr[mid] === obj) {
            while (mid > -1 && arr[mid - 1] === obj)
                mid--; //值重覆的元素，回逆到第一個
            return mid;
        }
        (arr[mid] < obj) ? low = mid + 1 : high = mid;
    }
    return low;
};
var bsearchGetter = function (getter, obj) {
    var len = parseInt(getter(-1)); //get the len
    var low = 0, high = len - 1; //getter is 1-based
    while (low < high) {
        var mid = (low + high) >> 1;
        if (getter(mid) === obj) {
            while (mid > -1 && getter(mid - 1) === obj)
                mid--; //值重覆的元素，回逆到第一個
            return mid;
        }
        getter(mid) < obj ? low = mid + 1 : high = mid;
    }
    return low;
};

var alphabetically = function (a, b) { return a > b ? 1 : ((a < b) ? -1 : 0); };
var alphabetically0 = function (a, b) { return a[0] > b[0] ? 1 : ((a[0] < b[0]) ? -1 : 0); };
var alphabetically1 = function (a, b) { return a[1] > b[1] ? 1 : ((a[1] < b[1]) ? -1 : 0); };
var alphabetically2 = function (a, b) { return a[2] > b[2] ? 1 : ((a[2] < b[2]) ? -1 : 0); };
//rename to lexicographically 
var length_alphabetically = function (a, b) { return a.length == b.length ? (a > b ? 1 : ((a < b) ? -1 : 0)) : a.length - b.length; };
var length_alphabetically0 = function (a, b) { return a[0].length == b[0].length ? (a[0] > b[0] ? 1 : ((a[0] < b[0]) ? -1 : 0)) : a[0].length - b[0].length; };
var length_alphabetically1 = function (a, b) { return a[1].length == b[1].length ? (a[1] > b[1] ? 1 : ((a[1] < b[1]) ? -1 : 0)) : a[1].length - b[1].length; };
var dedup = function (arr, sorted) {
    if (sorted === void 0) { sorted = false; }
    if (!arr || !arr.length)
        return [];
    if (!sorted)
        arr.sort(typeof arr == 'string' ? alphabetically : function (a, b) { return a - b; });
    var out = [];
    var prev = arr[0];
    for (var i = 1; i < arr.length; i++) {
        if (arr[i] === prev) {
            out.push([i, arr[i]]);
        }
        prev = arr[i];
    }
    return out;
};
var unique = function (arr, sorted) {
    if (sorted === void 0) { sorted = false; }
    if (!arr || !arr.length)
        return [];
    if (!sorted) {
        arr.sort(typeof arr[0] == 'string' ? alphabetically : function (a, b) { return a - b; });
    }
    var prev, out = [];
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] !== prev)
            out.push(arr[i]);
        prev = arr[i];
    }
    return out;
};
var unique1 = function (arr, sorted) {
    if (sorted === void 0) { sorted = false; }
    if (!arr || !arr.length)
        return [];
    if (!sorted) {
        arr.sort(typeof arr[1] == 'string' ? alphabetically1 : function (a, b) { return a[1] - b[1]; });
    }
    var out = [arr[0]];
    for (var i = 1; i < arr.length; i++) {
        if (arr[i][1] !== arr[i - 1][1]) {
            out.push(arr[i]);
        }
    }
    return out;
};
var unique0 = function (arr, sorted) {
    if (sorted === void 0) { sorted = false; }
    if (!arr || !arr.length)
        return [];
    if (!sorted) {
        arr.sort(typeof arr[0] == 'string' ? alphabetically0 : function (a, b) { return a[0] - b[0]; });
    }
    var out = [arr[0]];
    for (var i = 1; i < arr.length; i++) {
        if (arr[i][0] !== arr[i - 1][0]) {
            out.push(arr[i]);
        }
    }
    return out;
};
var statStrIntobject = function (o) {
    var out = [];
    for (var key in o) {
        out.push([o[key], key]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out;
};
var fromObj = function (obj, cb) {
    var arr = [];
    for (var key in obj) {
        if (!cb) {
            arr.push(key + '\t' + obj[key]);
        }
        else {
            if (typeof cb == 'function') {
                arr.push(cb(key, obj[key]));
            }
            else {
                arr.push([key, obj[key]]);
            }
        }
    }
    if (cb && typeof cb !== 'function') {
        arr.sort(function (a, b) { return b[1] - a[1]; });
    }
    return arr;
};
var sortObj = function (obj, func) {
    var arr = [];
    for (var key in obj) {
        arr.push([key, obj[key]]);
    }
    if (func)
        arr.sort(func);
    else
        arr.sort(function (a, b) {
            return +b[1] - a[1];
        });
    return arr;
};
var toObj = function (arr) {
    var obj = {};
    for (var i = 0; i < arr.length; i++) {
        if (!obj[arr[i]])
            obj[arr[i]] = 0;
        obj[arr[i]]++;
    }
    return obj;
};
var incObj = function (obj, key) {
    if (!obj[key])
        obj[key] = 0;
    obj[key]++;
};
var groupArr = function (arr) {
    return sortObj(toObj(arr));
};
var fillGap = function (sorted_int_array) {
    var prev = sorted_int_array[0] || 0;
    for (var i = 1; i < sorted_int_array.length; i++) { //fill the gap
        if (isNaN(sorted_int_array[i]))
            sorted_int_array[i] = prev;
        prev = sorted_int_array[i];
    }
    return sorted_int_array;
};
//
var sortNumberArray = function (arr) {
    var value_id = arr.map(function (v, idx) { return [v, idx]; });
    value_id.sort(function (a, b) { return a[0] - b[0]; });
    var indexes = value_id.map(function (_a) {
        _a[0]; var idx = _a[1];
        return idx;
    });
    var newarr = value_id.map(function (_a) {
        var v = _a[0]; _a[1];
        return v;
    });
    return [newarr, indexes];
};
var gini = function (sorted_arr) {
    var sum1 = 0, sum2 = 0;
    for (var i = 0; i < sorted_arr.length; i++) {
        var value = sorted_arr[i];
        sum1 += ((2 * (i + 1)) - sorted_arr.length - 1) * value;
        sum2 += value;
    }
    var perfect = (Math.pow(sorted_arr.length, 2) * (sum2 / sorted_arr.length));
    var g = sum1 / perfect;
    return g;
};

//type NumberArray = number [];
//arr need to be sorted but allow duplicate items
var union = function (arr1, arr2, hasdup) {
    if (hasdup === void 0) { hasdup = false; }
    if (!arr2 || !arr1)
        return arr1 || arr2;
    var extra = [];
    var a1 = hasdup ? unique(arr1) : arr1;
    var a2 = hasdup ? unique(arr2) : arr2;
    if (a1.length > a2.length) {
        var a = a2;
        a2 = a1;
        a1 = a;
    }
    for (var i = 0; i < a1.length; i++) {
        var at1 = bsearchNumber(a2, a1[i]);
        if (at1 == -1)
            extra.push(a1[i]);
    }
    return a2.concat(extra).sort();
};
//assumng arr2 is sorted
var xorStrings = function (arr1, arr2, index) {
    var out = [];
    for (var i = 0; i < arr1.length; i++) {
        var item = typeof index == 'number' ? arr1[i][index] : arr1[i];
        var at = bsearch(arr2, item);
        if (item !== arr2[at]) {
            out.push(arr1[i]);
        }
    }
    return out;
};
var intersect = function (arr1, arr2) {
    var out = [];
    var j = 0;
    for (var i = 0; i < arr1.length; i++) {
        var v = arr1[i];
        while (j < arr2.length) {
            if (arr2[j] >= v)
                break;
            j++;
        }
        if (v == arr2[j] && out[out.length - 1] !== v)
            out.push(v);
        if (j == arr2.length)
            break;
    }
    return out;
};
var intersects = function (arr) {
    if (!arr || !arr.length)
        return [];
    var out = arr.shift();
    while (arr.length) {
        out = intersect(out, arr.shift());
    }
    return out;
};
var arraydiff = function (arr1, arr2) { return arr1.filter(function (x) { return !arr2.includes(x); }).concat(arr2.filter(function (x) { return !arr1.includes(x); })); };
var removeSubstring = function (arr) {
    var markdelete = [];
    for (var i = 0; i < arr.length; i++) {
        for (var j = 0; j < arr.length; j++) {
            if (i == j)
                continue;
            if (arr[i].indexOf(arr[j]) > -1 && arr[j].length < arr[i].length) {
                if (markdelete.indexOf(j) == -1)
                    markdelete.push(j);
            }
        }
    }
    return arr.filter(function (it, idx) { return markdelete.indexOf(idx) == -1; });
};
// Jaccard similarity coefficient 
var similarSet = function (arr, basearr) {
    var I = intersect(arr, basearr);
    var U = union(arr, basearr);
    return I.length / U.length;
};
var indexOfs = function (arr, tofind) {
    var out = [];
    for (var j = 0; j < arr.length; j++) {
        if (~arr[j].indexOf(tofind)) {
            out.push(j);
        }
    }
    return out;
};
var groupNumArray = function (arr, int) {
    var items = [];
    var out = [items];
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] == int) {
            items = [];
            out.push(items);
        }
        else {
            items.push(arr[i]);
        }
    }
    return out;
};

var maxlen1 = 113;
var maxlen2 = 113 * 113; //12769
var maxlen3 = 113 * 113 * 113; //1442897
var CodeStart$2 = 0x0E;
var BYTE_MAX = 113;
var BYTE1_MAX = 45; //delta
var BYTE2_MAX = 44 * BYTE_MAX + BYTE1_MAX; //5017      //for year bc 2000~ad2280
var BYTE2_START = 45;
var BYTE3_START = 89;
var BYTE4_START = 105;
var BYTE5_START = 112;
var BYTE3_MAX = 16 * BYTE_MAX * BYTE_MAX + BYTE2_MAX; // ~204304     
var BYTE4_MAX = 6 * BYTE_MAX * BYTE_MAX * BYTE_MAX + BYTE3_MAX; // ~10100279   
var BYTE5_MAX = 2 * BYTE_MAX * BYTE_MAX * BYTE_MAX * BYTE_MAX + BYTE4_MAX; // 326094722
var SEP2DITEM = 0x7f;
var SEPARATOR2D = "\u007f";
var unpack3 = function (str) {
    var arr = [];
    var i1, i2, i3;
    var count = Math.floor(str.length / 3);
    for (var i = 0; i < count; i++) {
        i3 = str.charCodeAt(i * 3) - CodeStart$2;
        i2 = str.charCodeAt(i * 3 + 1) - CodeStart$2;
        i1 = str.charCodeAt(i * 3 + 2) - CodeStart$2;
        arr.push(maxlen1 * maxlen1 * i3 + maxlen1 * i2 + i1 - 1);
    }
    return arr;
};
var unpack2 = function (str) {
    var arr = [];
    var i1, i2;
    var count = Math.floor(str.length / 2);
    for (var i = 0; i < count; i++) {
        i2 = str.charCodeAt(i * 2) - CodeStart$2;
        i1 = str.charCodeAt(i * 2 + 1) - CodeStart$2;
        arr.push(maxlen1 * i2 + i1 - 1);
    }
    return arr;
};
var unpack1 = function (str) {
    var arr = [];
    var i1;
    var count = Math.floor(str.length);
    for (var i = 0; i < count; i++) {
        i1 = str.charCodeAt(i * 3) - CodeStart$2;
        arr.push(i1 - 1);
    }
    return arr;
};
var unpackInt = function (s, delta) {
    if (delta === void 0) { delta = false; }
    var arr = [];
    //let started=false;
    if (!s)
        return [];
    var o, i = 0, c = 0, prev = 0;
    while (i < s.length) {
        o = s.charCodeAt(i) - CodeStart$2;
        if (o < BYTE2_START) ;
        else if (o < BYTE3_START) {
            var i1 = s.charCodeAt(++i) - CodeStart$2;
            o -= BYTE2_START;
            o = o * BYTE_MAX + i1 + BYTE1_MAX;
        }
        else if (o < BYTE4_START) {
            var i2 = s.charCodeAt(++i) - CodeStart$2;
            var i1 = s.charCodeAt(++i) - CodeStart$2;
            o -= BYTE3_START;
            o = o * BYTE_MAX * BYTE_MAX + i2 * BYTE_MAX + i1 + BYTE2_MAX;
        }
        else if (o < BYTE5_START) {
            var i3 = s.charCodeAt(++i) - CodeStart$2;
            var i2 = s.charCodeAt(++i) - CodeStart$2;
            var i1 = s.charCodeAt(++i) - CodeStart$2;
            o -= BYTE4_START;
            o = o * BYTE_MAX * BYTE_MAX * BYTE_MAX + i3 * BYTE_MAX * BYTE_MAX + i2 * BYTE_MAX + i1 + BYTE3_MAX;
        }
        else if (o < SEP2DITEM) {
            var i4 = s.charCodeAt(++i) - CodeStart$2;
            var i3 = s.charCodeAt(++i) - CodeStart$2;
            var i2 = s.charCodeAt(++i) - CodeStart$2;
            var i1 = s.charCodeAt(++i) - CodeStart$2;
            o -= BYTE5_START;
            o = o * BYTE_MAX * BYTE_MAX * BYTE_MAX * BYTE_MAX
                + i4 * BYTE_MAX * BYTE_MAX * BYTE_MAX + i3 * BYTE_MAX * BYTE_MAX
                + i2 * BYTE_MAX + i1 + BYTE3_MAX;
        }
        else {
            throw new Error("exit max integer 0x7f," + o);
        }
        arr[c] = o + (delta ? prev : 0) - 1;
        prev = arr[c];
        c++;
        i++;
    }
    return arr; // return normal array , easier for consequence operation (intersect, union)
};
var unpackIntDelta = function (str) {
    return unpackInt(str, true);
};
var unpackIntDelta2d = function (str) {
    if (!str)
        return [];
    return unpackInt2d(str, true);
};
var unpackInt2d = function (str, delta) {
    if (delta === void 0) { delta = false; }
    if (!str)
        return [];
    var arr = str.split(SEPARATOR2D);
    if (arr.length == 1)
        return [unpackInt(arr[0])];
    return arr.map(function (it) { return unpackInt(it, delta); });
};
var unpack3_2d = function (str) {
    if (!str)
        return [];
    var arr = str.split(SEPARATOR2D);
    if (arr.length == 1)
        return [unpack3(arr[0])];
    return arr.map(function (it) { return unpack3(it); });
};
var unpackBoolean = function (str, index) {
    if (index === void 0) { index = false; }
    var barr = unpackInt(str);
    var out = [];
    var idx = 0; // 1-base is natural as payload follow right after packed_boolean ( 1 line)
    for (var i = 0; i < barr.length; i++) {
        for (j = 0; j < barr[i]; j++) {
            if (i % 2 == 0) {
                out.push(index ? 0 : false);
            }
            else {
                out.push(index ? ++idx : true);
            }
        }
    }
    return out;
};

//壓縮二維以下的自然數陣列為 ascii string ，只用0x0E 以上。
//type NumArray = number [] ;
var pack1 = function (arr) {
    var s = new Uint8Array(arr.length);
    var idx = 0;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] >= maxlen1)
            throw new Error("exit boundary " + arr[i]);
        var int = arr[i] + 1;
        if (isNaN(int))
            int = 0;
        s[idx++] = int + CodeStart$2; //allow -1
    }
    return new TextDecoder().decode(s);
};
var pack2 = function (arr) {
    var s = Uint8Array(arr.length * 2);
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] >= maxlen2) {
            throw new Error("exit boundary " + arr[i]);
        }
        var int = arr[i] + 1;
        if (isNaN(int))
            int = 0;
        var i1 = void 0, i2 = void 0;
        i1 = int % maxlen1;
        int = Math.floor(int / maxlen1);
        i2 = int % maxlen1;
        s[idx++] = i2 + CodeStart$2;
        s[idx++] = i1 + CodeStart$2;
    }
    return new TextDecoder().decode(s);
};
var pack3 = function (arr) {
    var s = Uint8Array(arr.length * 3);
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] >= maxlen3)
            throw "exit boundary " + arr[i];
        var int = arr[i] + 1;
        if (isNaN(int))
            int = 0;
        var i1 = void 0, i2 = void 0, i3 = void 0;
        i1 = int % maxlen1;
        int = Math.floor(int / maxlen1);
        i2 = int % maxlen1;
        i3 = Math.floor(int / maxlen1);
        s[idx++] = i3 + CodeStart$2;
        s[idx++] = i2 + CodeStart$2;
        s[idx++] = i1 + CodeStart$2;
    }
    return new TextDecoder().decode(s);
};
//might be two dimensional,separated by | 
var packInt2d = function (arr, delta) {
    if (delta === void 0) { delta = false; }
    var o = [];
    for (var i = 0; i < arr.length; i++) {
        o.push(packInt(arr[i], delta));
    }
    return o.join(SEPARATOR2D);
};
var pack3_2d = function (arr, esc) {
    var o = [];
    for (var i = 0; i < arr.length; i++) {
        o.push(pack3(arr[i]));
    }
    return o.join(SEPARATOR2D);
};
var packInt = function (arr, delta) {
    if (delta === void 0) { delta = false; }
    if (arr.length == 0)
        return '';
    var sz = arr.length * 5;
    var s = new Uint8Array(sz), int = arr[0] + 1, prev = arr[0], idx = 0;
    for (var i = 1; i <= arr.length; i++) {
        if (int < BYTE1_MAX) {
            s[idx++] = int + CodeStart$2;
        }
        else if (int < BYTE2_MAX) {
            int -= BYTE1_MAX;
            var i1 = void 0, i2 = void 0;
            i1 = int % BYTE_MAX;
            i2 = Math.floor(int / BYTE_MAX);
            s[idx++] = i2 + BYTE2_START + CodeStart$2;
            s[idx++] = i1 + CodeStart$2;
        }
        else if (int < BYTE3_MAX) {
            int -= BYTE2_MAX;
            var i1 = void 0, i2 = void 0, i3 = void 0;
            i1 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i2 = int % BYTE_MAX;
            i3 = Math.floor(int / BYTE_MAX);
            s[idx++] = i3 + BYTE3_START + CodeStart$2;
            s[idx++] = i2 + CodeStart$2;
            s[idx++] = i1 + CodeStart$2;
        }
        else if (int < BYTE4_MAX) {
            int -= BYTE3_MAX;
            var i1 = void 0, i2 = void 0, i3 = void 0, i4 = void 0;
            i1 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i2 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i3 = int % BYTE_MAX;
            i4 = Math.floor(int / BYTE_MAX);
            s[idx++] = i4 + BYTE4_START + CodeStart$2;
            s[idx++] = i3 + CodeStart$2;
            s[idx++] = i2 + CodeStart$2;
            s[idx++] = i1 + CodeStart$2;
        }
        else if (int < BYTE5_MAX) {
            int -= BYTE4_MAX;
            var i1 = void 0, i2 = void 0, i3 = void 0, i4 = void 0, i5 = void 0;
            i1 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i2 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i3 = int % BYTE_MAX;
            int = Math.floor(int / BYTE_MAX);
            i4 = int % BYTE_MAX;
            i5 = Math.floor(int / BYTE_MAX);
            s[idx++] = i5 + BYTE5_START + CodeStart$2;
            s[idx++] = i4 + CodeStart$2;
            s[idx++] = i3 + CodeStart$2;
            s[idx++] = i2 + CodeStart$2;
            s[idx++] = i1 + CodeStart$2;
        }
        else {
            // console.log(arr)
            // console.log('neighbor of arr',i,delta,arr.slice(i,10),arr.length, prev)
            throw new Error('exist max int boundary ' + BYTE5_MAX + ' i' + i + ',val:' + arr[i] + ' int' + int);
        }
        int = (delta ? arr[i] - prev : arr[i]) + 1;
        if (int < 0 && delta) {
            console.log('arr length', arr.length, 'now', arr[i], 'prev', prev);
            throw new Error('negative delta');
        }
        prev = arr[i] || 0;
    }
    //new TextDecoder is quite fast
    return new TextDecoder().decode(s.subarray(0, idx)); //slice will make new copy
};
var packBoolean = function (arr) {
    var out = [];
    var prev = false, count = 0;
    for (var i = 0; i < arr.length; i++) {
        if (prev != !!arr[i]) {
            out.push(count);
            count = 1;
        }
        else {
            count++;
        }
        prev = !!arr[i];
    }
    out.push(count);
    return packInt(out);
};
var packIntDelta = function (arr) { return packInt(arr, true); };
var packIntDelta2d = function (arr2d) { return packInt2d(arr2d, true); };
var arrDelta = function (arr) {
    if (!arr)
        return [];
    if (arr.length === 1)
        return [arr[0]];
    var out = [arr[0]];
    for (var i = 1; i < arr.length; i++) {
        var v = arr[i] - arr[i - 1];
        out.push(v);
    }
    return out;
};
var escapeStrWithQuote = function (str) { return str.replace(/"/g, '\\"'); };
var escapePackedStr = function (str) { return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, '$\\{'); };

//ascii number as separator and shared count, about 50% save
var CodeStart$1 = 0x0E, CodeEnd$1 = 0x1F, MaxShared = CodeEnd$1 - CodeStart$1;
var SEP = String.fromCharCode(CodeStart$1);
var packStrings = function (sl) {
    if (sl.length < 2)
        return sl.join(SEP);
    var out = sl[0];
    var prevhw = sl[0] || '';
    for (var i = 1; i < sl.length; i++) {
        var hw = sl[i];
        var shared = 0;
        while (shared < MaxShared && shared < hw.length && shared < prevhw.length
            && hw[shared] === prevhw[shared]) {
            shared++;
        }
        prevhw = sl[i] || '';
        if (shared && ((prevhw === null || prevhw === void 0 ? void 0 : prevhw.codePointAt(0)) || 0) < 0x10000) { //surrogate never shared.
            out += String.fromCharCode(CodeStart$1 + shared) + prevhw.substr(shared);
        }
        else {
            out += SEP + sl[i];
        }
    }
    return out;
};

var CodeStart = 0x0E, CodeEnd = 0x1F;
var unpackStrings = function (str) {
    var p = 0, s = '', prevstr = '', shared = 0;
    var out = [];
    while (p < str.length) {
        var code = str.charCodeAt(p);
        if (code >= CodeStart && code <= CodeEnd) {
            if (shared || s) {
                prevstr = prevstr.substr(0, shared) + s;
                out.push(prevstr);
            }
            shared = code - CodeStart;
            s = '';
        }
        else {
            s += str[p];
        }
        p++;
    }
    if (s)
        out.push(prevstr.substr(0, shared) + s);
    return out;
};

/**
 * StringArray backed by a delimitered string.
 * quick setup speed as spliting is not required.
 * preventing javscript engine to generate tons of "sliced string"
 * fast sequencial read and partial search (String.indexOf).
 * fast random seek by charpos at the space cost of 1/average_item_size)
 * */
var LEMMA_DELIMITER = '\x7f';
var SA_MATCH_ANY$1 = 3, SA_MATCH_START$1 = 0, SA_MATCH_MIDDLE$1 = 1, SA_MATCH_END$1 = 2;
var StringArray = /** @class */ (function () {
    function StringArray(buf, opts) {
        if (opts === void 0) { opts = {}; }
        var _this = this;
        this.buf = '';
        this.sep = '';
        this.charpos = [];
        this.middleCache = {};
        this.endCache = {};
        this.findMatches = function (rawtext) {
            var i = 0;
            var out = [];
            while (i < rawtext.length) {
                var tf = rawtext.slice(i);
                var m = _this.matchLongest(tf);
                if (m.length) {
                    i += m.length;
                    out.push([i, m[0][0], m[0][1]]);
                }
                else {
                    i++;
                }
            }
            return out;
        };
        this.sequencial = opts.sequencial;
        this.delimiter = opts.delimiter || ''; //separate key and value
        this.buf = buf;
        this.sep = opts.sep || '\n'; //separate item
        this.now = 0;
        // if (this.sep && this.sep.codePointAt(0) >=0x20) {
        // console.log('avoid using ascii bigger than space as separator, tab 0x09 is a better choice')
        // }
        //用\t (key\tvalue) ，不要用 =或 : 做分割符 ，去掉 value ，key 不必重排。(因 = 的ascii值在數字之後)
        //只做一次順序讀取，可節省 buildcharpos;
        if (!this.sequencial)
            this.buildcharpos();
    }
    StringArray.prototype.buildcharpos = function () {
        var prev = -1, p = 0;
        while (p < this.buf.length) {
            var at = this.buf.indexOf(this.sep, prev);
            if (at == -1) {
                this.charpos.push(this.buf.length);
                break;
            }
            else {
                this.charpos.push(at + 1);
                prev = at + 1;
            }
        }
    };
    StringArray.prototype.len = function () {
        return this.charpos.length;
    };
    StringArray.prototype.reset = function () {
        this.now = 0;
    };
    StringArray.prototype.first = function () {
        this.reset();
        return this.next();
    };
    StringArray.prototype.next = function () {
        if (this.now == -1)
            return;
        var at = this.buf.indexOf(this.sep, this.now);
        if (at == -1) {
            if (this.now >= 0) {
                var lastline = this.buf.slice(this.now);
                this.now = -1;
                return lastline;
            }
            else {
                this.now = -1;
                return;
            }
        }
        var s = this.buf.slice(this.now, at);
        this.now = at + 1;
        return s;
    };
    StringArray.prototype.get = function (idx) {
        if (idx == -1)
            return this.charpos.length.toString(); //for  bsearchGetter
        if (this.sequencial || idx < 0)
            return '';
        var from = idx == 0 ? 0 : this.charpos[idx - 1];
        var to = this.charpos[idx] - (idx == this.charpos.length - 1 ? 0 : 1);
        return this.buf.slice(from, to);
    };
    StringArray.prototype.at = function (offset) {
        return bsearchNumber(this.charpos, offset);
    };
    //assuming sorted
    StringArray.prototype.find = function (pat) {
        var getter = this.get.bind(this);
        if (this.delimiter)
            pat += this.delimiter;
        var at = bsearchGetter(getter, pat); // this.get(-1) return len
        var found = getter(at);
        return (found.endsWith(pat)) ? at : -1;
    };
    StringArray.prototype.indexOf = function (pat) {
        var at;
        at = this.buf.indexOf(pat);
        while (at > -1) {
            if (at == 0 && this.buf.charAt(pat.length) == this.sep)
                return 0;
            if (this.buf.length == pat.length + at && this.buf.charAt(at - 1) == this.sep)
                return this.len() - 1;
            if (this.buf.charAt(at - 1) == this.sep &&
                this.buf.charAt(at + pat.length) == this.sep) {
                return bsearchNumber(this.charpos, at) + 1;
            }
            else {
                at = this.buf.indexOf(pat, at + pat.length);
            }
        }
        return -1;
    };
    StringArray.prototype.enumMiddle = function (infix, max) {
        if (max === void 0) { max = 999; }
        if (this.middleCache.hasOwnProperty(infix)) {
            return this.middleCache[infix];
        }
        var idx = this.buf.indexOf(infix);
        var out = Array();
        while (idx > -1) {
            var at = this.at(idx);
            var lp = at ? this.charpos[at - 1] : 0;
            var lp2 = this.charpos[at] - 1 - infix.length;
            if (idx > lp && idx < lp2) {
                out.push(at);
                if (out.length > max)
                    break;
            }
            idx = this.buf.indexOf(infix, this.charpos[at] + this.sep.length);
        }
        this.middleCache[infix] = out;
        return out;
    };
    StringArray.prototype.enumStart = function (prefix, max) {
        if (max === void 0) { max = 999; }
        var getter = this.get.bind(this);
        var at = bsearchGetter(getter, prefix); // this.get(0) return len
        if (at == -1)
            return [];
        var out = Array();
        var len = this.len();
        while (at < len) {
            var found = this.get(at);
            if (found.startsWith(prefix)) {
                out.push(at);
                if (out.length > max)
                    break;
            }
            else
                break;
            at++;
        }
        return out;
    };
    StringArray.prototype.enumEnd = function (suffix, max) {
        if (max === void 0) { max = 999; }
        if (this.endCache.hasOwnProperty(suffix)) {
            console.log('cache');
            return this.endCache[suffix];
        }
        if (suffix[suffix.length - 1] !== this.sep)
            suffix = suffix + this.sep;
        var idx = this.buf.indexOf(suffix);
        var out = Array();
        while (idx > -1 && this.buf.charAt(idx - 1) !== this.sep) {
            var at = this.at(idx);
            out.push(at);
            if (out.length > max)
                break;
            idx = this.buf.indexOf(suffix, idx + this.sep.length);
        }
        this.endCache[suffix] = out;
        return out;
    };
    StringArray.prototype.enumAny = function (infix, max) {
        if (max === void 0) { max = 999; }
        if (this.middleCache.hasOwnProperty(infix)) {
            return this.middleCache[infix];
        }
        var idx = this.buf.indexOf(infix);
        var out = Array();
        while (idx > -1) {
            var at = this.at(idx);
            var lp = at ? this.charpos[at - 1] : 0;
            var lp2 = this.charpos[at] - 1 - infix.length;
            if (idx >= lp && idx <= lp2) {
                out.push(at);
                if (out.length > max)
                    break;
            }
            idx = this.buf.indexOf(infix, this.charpos[at] + this.sep.length);
        }
        this.middleCache[infix] = out;
        return out;
    };
    StringArray.prototype.enumMode = function (s, mode, max) {
        if (mode === void 0) { mode = 0; }
        if (mode == SA_MATCH_ANY$1)
            return this.enumAny(s, max);
        else if (mode == SA_MATCH_START$1)
            return this.enumStart(s, max);
        else if (mode == SA_MATCH_MIDDLE$1)
            return this.enumMiddle(s, max);
        else if (mode == SA_MATCH_END$1)
            return this.enumEnd(s, max);
        return [];
    };
    StringArray.prototype.matchLongest = function (text) {
        var getter = this.get.bind(this);
        var at = bsearchGetter(getter, text) - 1; // this.get(0) return len
        var out = [];
        var upper = at - 1;
        if (text.startsWith(this.get(at)))
            out.push([this.get(at), at]);
        var lower = at + 1;
        while (upper > 0) {
            var found = this.get(upper);
            //ascii stop immediately
            if (text.startsWith(found))
                out.push([found, upper]);
            else if (text.codePointAt(0) < 0x100 || text[0] !== found[0])
                break;
            upper--;
        }
        while (lower < this.len()) {
            var found = this.get(lower);
            if (text.startsWith(found))
                out.push([found, lower]);
            else if (text.codePointAt(0) < 0x100 || text[0] !== found[0])
                break;
            lower++;
        }
        out.sort(function (a, b) { return b[0].length - a[0].length; });
        return out;
    };
    /* if delimiter is missing, value is the text after key, ie , a fixed with key */
    StringArray.prototype.getValue = function (key) {
        var at = this.find(key);
        return ~at ? this.get(at).slice(key.length + this.delimiter.length) : '';
    };
    return StringArray;
}());

/* Errata 順序無所謂，每次會從頭找，比較慢 */
var patchBuf = function (buf, errata, fn) {
    if (fn === void 0) { fn = ''; }
    if (!errata || !errata.length)
        return buf;
    var outbuf = buf;
    var _loop_1 = function (i) {
        var _a = errata[i], from = _a[0], to = _a[1];
        var n = errata[i][3] || 0;
        var occur = errata[i][2] || 1;
        var unlimited = occur == -1;
        var newoutbuf = outbuf;
        if (typeof to === 'function') {
            if (typeof from === 'string') {
                while (occur > 0) {
                    newoutbuf = newoutbuf.replace(from, function (m, m1, m2) {
                        occur--;
                        return to(m, m1, m2, m3);
                    });
                    occur--;
                }
            }
            else { //regex
                newoutbuf = newoutbuf.replace(from, function (m, m1, m2, m3) {
                    occur--;
                    return to(m, m1, m2, m3);
                });
            }
        }
        else {
            if (typeof from === 'string') {
                while (occur > 0) {
                    var torepl = to.replace(/\$\$/g, n);
                    newoutbuf = newoutbuf.replace(from, torepl);
                    n++;
                    occur--;
                }
            }
            else { //regex from , string to
                newoutbuf = newoutbuf.replace(from, function (m, m1, m2) {
                    var torepl = to.replace(/\$1/g, m1).replace(/\$2/g, m2).replace(/\$\$/g, n);
                    n++;
                    occur--;
                    return torepl;
                });
            }
        }
        if (newoutbuf === outbuf && !unlimited) {
            console.log(fn, "cannot replace", errata[i]);
        }
        else {
            if (typeof errata[i][2] !== 'undefined')
                errata[i][2] = occur;
        }
        outbuf = newoutbuf;
        if (occur !== 0 && !unlimited) {
            console.log(fn, "errata is not cleared!", occur, 'left', errata[i]);
        }
    };
    for (var i = 0; i < errata.length; i++) {
        _loop_1(i);
    }
    return outbuf;
};
var RemainingErrata = function (Erratas) {
    var count = 0;
    var _loop_2 = function (key) {
        var arr = Erratas[key];
        if (!Array.isArray(arr))
            arr = [arr];
        arr.forEach(function (_a) {
            var from = _a[0]; _a[1]; var remain = _a[2];
            if (remain) {
                count++;
                console.log(key, 'remain', remain, 'from', from);
            }
        });
    };
    for (var key in Erratas) {
        _loop_2(key);
    }
    return count;
};
/* 順序找定位點，插入文字，比 patchBuf 快，盡量用這個除非要刪改文字。*/
var insertBuf = function (buf, inserts, fn) {
    if (fn === void 0) { fn = ''; }
    if (!inserts || !inserts.length)
        return buf;
    var outbuf = '', prev = 0;
    for (var i = 0; i < inserts.length; i++) {
        var _a = inserts[i], tofind = _a[0], insert = _a[1], offset = _a[2];
        var insertbefore = false;
        // pin syntax > 插入到找到字串之後    < 插入到找到字串之前
        if (~tofind.indexOf('>', 1) || ~tofind.indexOf('<', 1)) { //has pin , not at the first char
            var at_1 = tofind.indexOf('>', 1);
            if (at_1 == -1) {
                at_1 = tofind.indexOf('<', 1);
                insertbefore = true;
            }
            offset = tofind.slice(at_1 + 1);
            tofind = tofind.slice(0, at_1);
        }
        var at = buf.indexOf(tofind, prev);
        if (at == -1) {
            console.log("cannot find", tofind, '#' + i, fn);
            outbuf += buf.slice(prev);
            return outbuf;
        }
        at += tofind.length;
        if (typeof offset == 'number' && offset) {
            at += offset;
        }
        else if (typeof offset == 'string') {
            var at2 = buf.indexOf(offset, at);
            if (at2 == -1) {
                console.log("cannot find offset", tofind, 'offset', offset, '#' + i, fn);
                outbuf += buf.slice(prev);
                return outbuf;
            }
            else {
                at = at2;
            }
            if (!insertbefore) {
                at += offset.length;
            }
        }
        outbuf += buf.slice(prev, at);
        outbuf += insert;
        prev = at;
    }
    outbuf += buf.slice(prev);
    return outbuf;
};

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var escapeTemplateString = function (str) { return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, '$\\{'); };
var unescapeTemplateString = function (str) { return str.replace(/\\\\/g, "\\").replace(/\\`/g, "`").replace(/$\\{/g, "\$\{"); };
function pagejsonpfn(nchunk, folder) {
    if (folder === void 0) { folder = ''; }
    var jsfn = nchunk.toString().padStart(3, '0') + '.js';
    return folder ? folder + '/' + jsfn : jsfn;
}
var lineBreaksOffset = function (str) {
    var i = 0;
    var out = Array();
    while (i < str.length) {
        var at = str.indexOf('\n', i);
        if (at == -1)
            break;
        out.push(at);
        i = at + 1;
    }
    return out;
};
var JSONParse = function (str) {
    var at1 = str.indexOf('{');
    var at2 = str.lastIndexOf('}');
    if (at1 > -1 && at2 > at1) {
        str = str.slice(at1, at2 + 1);
    }
    str = str.replace(/['"]?([a-zA-Z\d]+)['"]? *\:/g, '"$1":');
    return JSON.parse(str);
};
var humanBytes = function (n) {
    if (n < 1024) {
        return [n, 'B'];
    }
    if (n < 1024 * 1024) {
        return [parseFloat((n / 1024).toFixed(2)), 'KB'];
    }
    else {
        return [parseFloat((n / (1024 * 1024)).toFixed(2)), 'MB'];
    }
};
function debounce(f, ms) {
    var timer;
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        clearTimeout(timer);
        timer = setTimeout(f.bind.apply(f, __spreadArray([this], args, false)), ms);
    };
}

var cssSkeleton = function (typedefs, ptkname) {
    var out = [];
    for (var n in typedefs) {
        out.push('.' + ptkname + ' .' + n + ' \n{ \n}');
    }
    return out.join('\n');
};

var parseJsonp = function (str) {
    var start = str.indexOf('{');
    var end = str.indexOf('},`') + 1;
    var payload = str.substring(end + 2, str.length - 1);
    if (payload[payload.length - 1] == '`')
        payload = payload.slice(0, payload.length - 1);
    //indexOf is much faster than regex, replace only when needed
    if (payload.indexOf("\\\\") > -1)
        payload = payload.replace(/\\\\/g, "\\");
    if (payload.indexOf("\\`") > -1)
        payload = payload.replace(/\\`/g, "`");
    if (payload.indexOf("$\\{") > -1)
        payload = payload.replace(/\$\\\{/g, '${');
    return [JSON.parse(str.substring(start, end)), payload];
};
var unloadScript = function (src) {
    if (src.slice(0, 2) == './')
        src = src.slice(2);
    var css = src.endsWith('.css');
    var children = document.head.children;
    for (var i = 0; i < children.length; i++) {
        var ele = children[i];
        if (css && ele.tagName == 'LINK' && ele.href.endsWith('/' + src)
            || (ele.tagName == 'SCRIPT' && ele.src.endsWith('/' + src))) {
            document.head.removeChild(ele);
        }
    }
};
var loadScript = function (src, cb) { return __awaiter(void 0, void 0, void 0, function () {
    var css, children, i, ele, promise;
    return __generator(this, function (_a) {
        if (cb && cb()) {
            return [2 /*return*/, true]; //no need to load
        }
        if (src.slice(0, 2) == './')
            src = src.slice(2);
        css = src.endsWith('.css');
        children = document.head.children;
        for (i = 0; i < children.length; i++) {
            ele = children[i];
            if (css && ele.tagName == 'LINK' && ele.href.endsWith('/' + src)) {
                if (i < children.length - 1) { //precedence by later append
                    document.head.removeChild(ele);
                    document.head.appendChild(ele);
                }
                return [2 /*return*/, true];
            }
            else if (ele.tagName == 'SCRIPT' && ele.src.endsWith('/' + src))
                return [2 /*return*/, true];
        }
        promise = new Promise(function (resolve, reject) {
            var script = document.createElement(css ? "link" : "script");
            script.type = css ? 'text/css' : 'text/javascript';
            if (css) {
                script.rel = 'stylesheet';
                script.href = src;
            }
            else {
                script.src = src;
            }
            script.onerror = reject;
            script.async = true;
            script.onload = resolve;
            document.head.appendChild(script);
        });
        return [2 /*return*/, promise];
    });
}); };

/* convert bopomofo to pinyin */
//'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ',
//'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ'
var consonants = 'b,p,m,f,d,t,n,l,g,k,h,j,q,x,zh,ch,sh,r,z,c,s'.split(',');
var vowels = 'a,o,e,e,ai,ei,ao,ou,an,en,ang,eng,er,i,u,v'.split(',');
var toPinyin = function (bopomofo) {
    var tone = '', out = '', vowel = false;
    var tonecp = bopomofo.charCodeAt(bopomofo.length - 1);
    if (tonecp == 0x02ca)
        tone = 2;
    else if (tonecp == 0x02cb)
        tone = 4;
    else if (tonecp == 0x02c7)
        tone = 3;
    for (var i = 0; i < bopomofo.length; i++) {
        var cp = bopomofo.charCodeAt(i);
        if (cp >= 0x3105 && cp <= 0x3119) {
            out += consonants[cp - 0x3105];
        }
        else if (cp >= 0x311a && cp <= 0x3129) {
            out += vowels[cp - 0x311a];
            vowel = true;
        }
    }
    if (out.length == 1 && out == 'u')
        out = 'wu';
    out = out.replace(/^i/, 'yi').replace(/^v/, 'yu').replace(/^u/, 'w')
        .replace('qv', 'qu')
        .replace('xv', 'xu')
        .replace('jv', 'ju')
        .replace('ieng', 'ing')
        .replace('xiu', 'xu')
        .replace('niu', 'nu')
        .replace('ien', 'in')
        .replace('iou', 'iu')
        .replace('iuan', 'uan')
        .replace('ueng', 'ong')
        .replace('uen', 'un')
        .replace('uei', 'ui')
        .replace('qo', 'qio')
        .replace('xo', 'xio')
        .replace('jo', 'jio')
        .replace('yia', 'ya')
        .replace('yie', 'ye')
        .replace('yio', 'yo')
        .replace('yiu', 'you')
        + (vowel ? '' : 'i') + tone;
    return out;
};
var replaceZhuyin = function (str) {
    return str.replace(/([\u3105-\u3129]+[ˇˋˊ]?)/g, function (m, m1) { return toPinyin(m1); });
};

/* convert a number to a-z , base 26 */
var toBase26 = function (num) {
    var str = num.toString(26).toLowerCase();
    var out = '';
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code >= 0x30 && code < 0x40) {
            out += String.fromCharCode(code - 0x30 + 0x61); //0=>a , 1=>b start from a
        }
        else {
            out += String.fromCharCode(code + 10); // a => k and so on
        }
    }
    return out;
};
var fromBase26 = function (str) {
    var out = '';
    str = str.toLowerCase();
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i) - 0x61;
        if (code < 10) {
            out += String.fromCharCode(code + 0x30);
        }
        else {
            out += String.fromCharCode(code - 10 + 0x41);
        }
    }
    return parseInt(out, 26);
};

/*
    milestone.json 格式
    {"6p0040a14":101,             //直接加入段號
    //同一行多個insert 以 @1, @2 表示
     "6p0040a14@1":[102,"諸",1],  // 重覆再找1次"諸"，在該位置加上 102， 省略 第三個元素表示一找到即是
    }
*/
var getInserts = function (milestones, msid) {
    if (!milestones)
        return null;
    var out = [];
    var n = 0; // milestone key 必須唯一，如果一個lb 中有多於一個milestone, 以@1, @2 表示
    var id = msid;
    var m = milestones[id];
    while (m) { // 非零的數字或字串
        out.push(m);
        id = msid + '+' + (++n);
        m = milestones[id];
    }
    if (!out.length)
        return null; //此lb 無milestone
    else
        return out; //多於一個
};
var insertAtOccur = function (text, ins) {
    var toinsert = ins[0], tofind = ins[1]; // 要插入的數字或字串，
    if (typeof tofind === 'number') { //字串位置
        if (text.length > tofind) {
            return text.substr(0, tofind) + toinsert + text.substr(tofind);
        }
        else {
            ins[1] = tofind - text.length;
            return text;
        }
    }
    else { // 插入點(搜尋字串)，重覆搜尋次數
        var at = text.indexOf(tofind);
        while (at > -1 && ins[2] > 0) {
            at = text.indexOf(tofind, at + tofind.length);
            ins[2]--; //因 text cl 可能被破開，ins[2]是第n個出現，找到就要減1。
        }
        return at === -1 ? text : text.substr(0, at) + toinsert + text.substr(at);
    }
};
var insertText = function (text, inserts) {
    if (!inserts || !inserts.length)
        return text;
    var t = text;
    while (inserts.length) {
        var ins = inserts.shift();
        var newtext = insertAtOccur(t, ins);
        if (newtext === text) { //not inserted, wait for next string el
            inserts.unshift(ins);
            break;
        }
        else {
            t = newtext;
        }
    }
    return t;
};

var headerWithNumber = [
    /第([一二三四五六七八九十百千○〇零]+)[回章卷品節]*/,
    /卷([一二三四五六七八九十百千○〇零]+)/,
    /卷第([一二三四五六七八九十百千○〇零]+)/,
];
var isChineseNumber = function (str, pat) {
    pat = pat || /[一二三四五六七八九十百千○〇]+/;
    return str.replace(pat, '') == '';
};
var fromChineseNumber = function (str) {
    return parseInt(str.trim()
        .replace(/百([二三四五六七八九])十/, '$1十')
        .replace(/百十$/, '10')
        .replace(/百十/, '1')
        .replace(/百$/, '00')
        .replace(/百/, '0')
        .replace(/一/g, '1')
        .replace(/二/g, '2')
        .replace(/三/g, '3')
        .replace(/四/g, '4')
        .replace(/五/g, '5')
        .replace(/六/g, '6')
        .replace(/七/g, '7')
        .replace(/八/g, '8')
        .replace(/九/g, '9')
        .replace(/^十$/, '10')
        .replace(/^十/, '1')
        .replace(/十$/, '0')
        .replace(/十/, '')
        .replace(/[○〇O零]/g, '0'));
};
var chineseDigit = function (n) {
    return;
};
var toChineseNumber = function (n) {
    var out = '';
    while (n) {
        var digit = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'][n % 10];
        out = digit + out;
        n = Math.floor(n / 10);
    }
    return out;
};
var isChineseChapter = function (str) {
    for (var i = 0; i < headerWithNumber.length; i++) {
        var pat = headerWithNumber[i];
        var m = str.match(pat);
        if (m) {
            return fromChineseNumber(m[1]);
        }
    }
    return null;
};
var extractChineseNumber = function (str, begining) {
    if (begining === void 0) { begining = false; }
    var cn = -1;
    for (var i = 0; i < headerWithNumber.length; i++) {
        var pat = headerWithNumber[i];
        var m = str.match(pat);
        if (m)
            cn = fromChineseNumber(m[1]);
    }
    if (!cn) {
        var m = begining ? str.match(/^[　 ]?([一二三四五六七八九十○百零]+)/) : str.match(/([一二三四五六七八九十○百零]+)/);
        if (m)
            cn = fromChineseNumber(m[1]);
    }
    return cn;
};
var StyledNumber1 = { 'Ⅰ': 10, 'ⅰ': 10, '⒜': 26, 'Ⓐ': 26, 'ⓐ': 26, '⓫': 10, '㉑': 15, '㍘': 25, '㍙': 24, '㈠': 10,
    '㊀': 10, '㋀': 12, '㏠': 31, '①': 50, '⑴': 20, '⒈': 20, '⓵': 10, '❶': 10, '➀': 10, '➊': 10,
    '₁': 9 };
var styledNumber = function (n, style, offset) {
    if (style === void 0) { style = '①'; }
    if (offset === void 0) { offset = 1; }
    var max = StyledNumber1[style];
    if (typeof n !== 'number')
        n = parseInt(n) || 0;
    if (!max) { //u
        return n.toString(); //fall back
    }
    else {
        if ((n - offset) >= max) {
            return n.toString();
        }
        if (style == '①') {
            if (n > 35) {
                style = '㊱';
                n -= 35;
            }
            else if (n > 20) {
                style = '㉑';
                n -= 20;
            }
            if (n == 0)
                return '⓪';
        }
        var code = style.charCodeAt(0) + n - offset;
        return String.fromCharCode(code);
    }
};
var ForeignNumbers = { '၀': true, '०': true, '๐': true, '໐': true, '០': true, '༠': true };
var foreignNumber = function (n, style) {
    var s = n.toString();
    var zero = ForeignNumbers[style];
    if (!zero)
        return s;
    var base = style.charCodeAt(0);
    var out = '';
    for (var i = 0; i < s.length; i++) {
        out += String.fromCharCode(s.charCodeAt(i) - 0x30 + base);
    }
    return out;
};
var qianziwen = "天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏閏餘成歲律呂調陽雲騰致雨露結為霜金生麗水玉出崑崗劍號巨闕珠稱夜光果珍李奈菜重芥薑海咸河淡鱗潛羽翔龍師火帝鳥官人皇始制文字乃服衣裳推位讓國有虞陶唐弔民伐罪周發殷湯坐朝問道垂拱平章愛育黎首臣伏戎羌遐邇壹體率賓歸王鳴鳳在樹白駒食場化被草木賴及萬方蓋此身髮四大五常恭惟鞠養豈敢毀傷女慕貞絜男效才良知過必改得能莫忘罔談彼短靡恃己長信使可覆器欲難量墨悲絲染詩讚羔羊景行維賢剋念作聖德建名立形端表正空谷傳聲虛堂習聽禍因惡積福緣善慶尺璧非寶寸陰是競資父事君曰嚴與敬孝當竭力忠則盡命臨深履薄夙興溫清似蘭斯馨如松之盛川流不息淵澄取映容止若思言辭安定篤初誠美慎終宜令榮業所基藉甚無竟學優登仕攝職從政存以甘棠去而益詠樂殊貴賤禮別尊卑上和下睦夫唱婦隨外受傅訓入奉母儀諸姑伯叔猶子比兒孔懷兄弟同氣連枝交友投分切磨箴規仁慈隱惻造次弗離節義廉退顛沛匪虧性靜情逸心動神疲守真志滿逐物意移堅持雅操好爵自縻都邑華夏東西二京背邙面洛浮渭據涇宮殿盤鬱樓觀飛驚圖寫禽獸畫彩仙靈丙舍傍啟甲帳對楹肆筵設席鼓瑟吹笙升階納陛弁轉疑星右通廣內左達承明既集墳典亦聚群英杜稿鍾隸漆書壁經府羅將相路俠槐卿戶封八縣家給千兵高冠陪輦驅轂振纓世祿侈富車駕肥輕策功茂實勒碑刻銘磻溪伊尹佐時阿衡奄宅曲阜微旦孰營桓公輔合濟弱扶傾綺回漢惠說感武丁俊乂密勿多士寔寧晉楚更霸趙魏困橫假途滅虢踐土會盟何遵約法韓弊煩刑起翦頗牧用軍最精宣威沙漠馳譽丹青九州禹跡百郡秦并岳宗泰岱禪主云亭雁門紫塞雞田赤城昆池碣石鉅野洞庭曠遠綿邈岩岫杳冥治本於農務茲稼穡俶載南畝我藝黍稷稅熟貢新勸賞黜陟孟軻敦素史魚秉直庶幾中庸勞謙謹敕聆音察理鑒貌辨色貽厥嘉猷勉其祗植省躬譏誡寵增抗極殆辱近恥林皋幸即兩疏見機解組誰逼索居閒處沉默寂寥求古尋論散慮逍遙欣奏累遣慼謝歡招渠荷的歷園莽抽條枇杷晚翠梧桐早凋陳根委翳落葉飄颻遊鵾獨運凌摩絳霄耽讀翫市寓目囊箱易輶攸畏屬耳垣牆具膳餐飯適口充腸飽飫烹宰飢厭糟糠親戚故舊老少異糧妾御績紡侍巾帷房紈扇圓潔銀燭煒煌晝眠夕寐藍筍象床弦歌酒宴接杯舉觴矯手頓足悅豫且康嫡後嗣續祭祀烝嘗稽顙再拜悚懼恐惶牋牒簡要顧答審詳骸垢想浴執熱願涼驢騾犢特駭躍超驤誅斬賊盜捕獲叛亡布射遼丸嵇琴阮嘯恬筆倫紙鈞巧任釣釋紛利俗並皆佳妙毛施淑姿工顰妍笑年矢每催曦暉朗曜璇璣懸斡晦魄環照指薪修祜永綏吉劭矩步引領俯仰廊廟束帶矜莊徘徊瞻眺孤陋寡聞愚蒙等誚謂語助者焉哉乎也";
//follow by max 999
var normalizeQianziwen = function (s) {
    return s.replace('巖', '岩').replace('凊', '清').replace('嶽', '岳').replace('克', '剋').replace('吊', '弔').replace('柰', '奈').replace('鹹', '咸').replace('贊', '讚').replace('咏', '詠');
};
var parseQianziwen = function (s, juancount) {
    if (s === void 0) { s = ''; }
    if (juancount === void 0) { juancount = 10; }
    s = normalizeQianziwen(s);
    var at = qianziwen.indexOf(s.charAt(0));
    if (~at) {
        var follow = s.length > 1 ? parseInt(s.slice(1), 10) - 1 : 0;
        if (isNaN(follow)) {
            return -1;
        }
        return at * juancount + follow;
    }
    return -1;
};

var escapeHTML = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
var Entities = {
    lt: '<', gt: '>', 'amp': '&',
    'eacute': 'é',
    'agrave': 'à',
    'hellip': '…',
    'igrave': 'ì',
    'ugrave': 'ù',
    'ntilde': 'ñ', 'Ntilde': 'Ñ',
    'nbsp': ' ', 'quot': '"', "ucirc": 'û', 'acirc': 'â', 'icirc': 'î'
};
var entity2unicode = function (s) {
    s = s.replace(/&#x([\dABCDEF]{3,20});/g, function (m, m1) {
        return String.fromCodePoint(parseInt(m1, 16));
    }).replace(/&#(\d{2,5});/g, function (m, m1) {
        return String.fromCodePoint(parseInt(m1, 10));
    }).replace(/&([^;]{5,20});/g, function (m, m1) {
        var rep = Entities[m1];
        if (!rep) {
            console.log('cannot parse', '&' + m1 + ';');
            throw "wrong entity ";
        }
        return rep;
    });
    return s;
};

var sleep = function (time) { return new Promise(function (r) { setTimeout(function () { return r(); }, time); }); };
var updateUrl = function (address) {
    window.location.hash = '#' + address;
};
var addressFromUrl = function () {
    var hash = window.location.hash;
    if (hash[0] == '#')
        hash = hash.slice(1);
    var address = decodeURI(hash);
    if (~address.indexOf('%'))
        address = decodeURIComponent(address);
    if (!~address.indexOf('bk') && !~address.indexOf('ak'))
        address = ''; //invalid adress
    return address;
};
var loadUrl = function (url) { return __awaiter(void 0, void 0, void 0, function () {
    var text, response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                text = '';
                return [4 /*yield*/, fetch(url)];
            case 1:
                response = _a.sent();
                if (!(response.status >= 200 && response.status < 300)) return [3 /*break*/, 3];
                return [4 /*yield*/, response.text()];
            case 2:
                text = _a.sent();
                _a.label = 3;
            case 3: return [2 /*return*/, text];
        }
    });
}); };
var urlPrefix = function () {
    return location.href.slice(0, location.href.length - location.search.length).replace(/index.html$/, '');
};

var URL_REGEX = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/;

// for dictonary entries
var TerminalFlag = '$';
var PopOpetator = ')';
var TrieNode = /** @class */ (function () {
    function TrieNode(char, value, terminated) {
        if (terminated === void 0) { terminated = false; }
        this.char = char;
        this.value = value;
        this.terminated = terminated;
        this.children = {};
    }
    return TrieNode;
}());
var Trie = /** @class */ (function () {
    function Trie() {
        this.root = new TrieNode('', undefined, false);
    }
    Trie.prototype.add = function (key, value) {
        if (value === void 0) { value = undefined; }
        var length = key.length;
        var node = this.root;
        for (var i = 0; i < length; i++) {
            var char = key.charAt(i);
            if (!node.children[char]) {
                node.children[char] = new TrieNode(char, undefined, false);
            }
            else if (i == length - 1) {
                // throw "key already exists" + key;
                console.error('key exists', key);
            }
            node = node.children[char];
        }
        node.value = value;
        node.terminated = true;
    };
    Trie.prototype.find = function (key) {
        var length = key.length;
        var node = this.root;
        for (var i = 0; i < length; i++) {
            var char = key.charAt(i);
            if (node.children[char]) {
                node = node.children[char];
            }
            else {
                return undefined;
            }
        }
        return node;
    };
    Trie.prototype.keysWithPrefix = function (prefix) {
        var node = this.find(prefix);
        if (!node) {
            return [];
        }
        var result = [];
        _traverse(node, prefix.split(''), result);
        return result.sort();
    };
    Trie.prototype.serialize = function () {
        var stack = [];
        _serialize(this.root, stack);
        return stack.join('');
    };
    Trie.prototype.deserialize = function (serialized) {
        var list = serialized.split('');
        var length = list.length;
        var trie = new Trie();
        var chars = [];
        var index = 0, count = 0;
        while (index < length) {
            var ch = list[index];
            switch (ch) {
                case TerminalFlag:
                    //count is same as orginal index if sorted
                    trie.add(chars.join(''), count);
                    count++;
                    break;
                case PopOpetator:
                    chars.pop();
                    break;
                default:
                    chars.push(ch);
                    break;
            }
            index++;
        }
        return trie;
    };
    Trie.prototype.deserializeToArray = function (serialized) {
        var list = serialized.split('');
        var length = list.length;
        var chars = [];
        var index = 0;
        var out = [];
        while (index < length) {
            var ch = list[index];
            switch (ch) {
                case TerminalFlag:
                    out.push(chars.join(''));
                    break;
                case PopOpetator:
                    chars.pop();
                    break;
                default:
                    chars.push(ch);
                    break;
            }
            index++;
        }
        return out;
    };
    return Trie;
}());
function _traverse(node, prefixStack, result) {
    if (node.terminated) {
        result.push(prefixStack.join(''));
    }
    for (var char in node.children) {
        var child = node.children[char];
        prefixStack.push(char);
        _traverse(child, prefixStack, result);
        prefixStack.pop();
    }
}
function _serialize(node, stack) {
    stack.push(node.char);
    if (node.terminated) {
        stack.push(TerminalFlag);
    }
    for (var char in node.children) {
        var child = node.children[char];
        _serialize(child, stack);
        stack.push(PopOpetator);
    }
}

var Indexer = /** @class */ (function () {
    function Indexer() {
        this.wordscount = 0;
        this.words = new Object();
        this.postingcount = [];
        this.bmp = new Int32Array(65536);
        this.tokenlist = [];
        this.postings = [];
        this.tokenlinepos = [];
        this.bmppostings = new Array(65536);
        this.bmptokencount = new Int32Array(65536);
        this.tokencount = new Int32Array(0);
        this.finalized = false;
        this.wordcount = 0;
    }
    Indexer.prototype.addLine = function (line) {
        if (!line || line.startsWith('iVBO') || ~line.indexOf('.png\t') || ~line.indexOf('.jpg\t')) {
            this.tokenlist.push(0);
            return;
        }
        var tokens = tokenize$1(line);
        for (var j = 0; j < tokens.length; j++) {
            var _a = tokens[j], text = _a.text, type = _a.type;
            var cp = text.codePointAt(0) || 0;
            if (type == exports.TokenType.CJK_BMP) {
                this.bmp[cp]++;
                this.tokenlist.push(cp);
                this.wordcount++;
            }
            else if (type >= exports.TokenType.SEARCHABLE) {
                var at = this.words[text];
                if (typeof at == 'undefined') {
                    at = this.wordscount;
                    this.postingcount.push(0);
                    this.words[text] = at;
                    this.wordscount++;
                }
                this.postingcount[at]++;
                this.tokenlist.push(at + 65536);
                this.wordcount++;
            }
            else {
                this.tokenlist.push(-1); //unsearchable token
            }
        }
        this.tokenlist.push(0); //line separator
    };
    Indexer.prototype.add = function (lines) {
        if (this.finalized) {
            throw "already finalized";
        }
        lines.reset();
        var line = lines.next();
        while (line || line === '') {
            this.addLine(line);
            line = lines.next();
        }
    };
    Indexer.prototype.finalize = function () {
        this.finalized = true;
        this.postings = new Array(this.wordscount);
        this.tokencount = new Int32Array(this.wordscount);
        for (var i = 0; i < this.wordscount; i++) {
            this.postings[i] = new Int32Array(this.postingcount[i]);
        }
        for (var i = 0x0; i < this.bmp.length; i++) {
            if (this.bmp[i]) {
                this.bmppostings[i] = new Int32Array(this.bmp[i]);
            }
        }
        // console.log('tokenlist',this.tokenlist.length)
        for (var i = 0; i < this.tokenlist.length; i++) {
            var code = this.tokenlist[i];
            if (code == -1)
                continue;
            if (code == 0) { //line break
                this.tokenlinepos.push(i);
            }
            else if (code < 0x10000) {
                if (this.bmppostings[code]) {
                    this.bmppostings[code][this.bmptokencount[code]] = i;
                    this.bmptokencount[code]++;
                }
            }
            else if (!isNaN(code)) {
                var at = code - 65536;
                this.postings[at][this.tokencount[at]] = i;
                this.tokencount[at]++;
            }
        }
        this.tokenlinepos.push(this.tokenlist.length); //the terminator
    };
    Indexer.prototype.serialize = function () {
        if (!this.finalized) {
            throw "not finalized";
        }
        var tokens = [], postings = [];
        var tokentable = fromObj(this.words, function (word, nposting) { return [word, nposting]; });
        tokentable.sort(alphabetically0);
        var words = tokentable.map(function (_a) {
            var word = _a[0];
            return word;
        });
        tokens.push(words.join(LEMMA_DELIMITER)); //stringarray cannot use packStrings
        var bmpWithPosting = [];
        for (var i = 0; i < this.bmppostings.length; i++) {
            if (this.bmppostings[i])
                bmpWithPosting.push(i);
        }
        tokens.push(packIntDelta(bmpWithPosting));
        tokens.push(packIntDelta(this.tokenlinepos));
        for (var i = 0; i < this.bmppostings.length; i++) {
            if (!this.bmppostings[i])
                continue;
            //原文刪去一些字或者用全集tokentable 但只索引子集，tokentable 沒更新, tokencount 會較小。
            //增加的字會找不到。
            var s = packIntDelta(this.bmppostings[i]);
            postings.push(s);
        }
        for (var i = 0; i < tokentable.length; i++) {
            var nposting = tokentable[i][1];
            if (!this.postings[nposting])
                continue;
            var s = packIntDelta(this.postings[nposting]);
            postings.push(s);
        }
        return [tokens, postings, this.wordcount];
    };
    return Indexer;
}());

const sc2tc=`㑔㑯
㑇㑳
㐹㑶
刾㓨
㘎㘚
㚯㜄
㛣㜏
㟆㠏
㤘㥮
㨫㩜
㧐㩳
擜㩵
㻪㻽
䀥䁻
鿎䃮
䌶䊷
䌺䋙
䌻䋚
䌿䋹
䌾䋻
䎬䎱
䙌䙡
䜧䜀
䞍䝼
䦂䥇
鿏䥑
䥾䥱
䦶䦛
䦷䦟
䯅䯀
鲃䰾
䲣䱷
䲝䱽
鳚䲁
鳤䲘
鹮䴉
丢丟
并<併並
干<幹>乾
乱亂
亚亞
伫佇
来來
仑侖
侣侶
俣俁
系<繫係
伣俔
侠俠
伡俥
伥倀
俩倆
俫倈
仓倉
个個
们們
伦倫
㑈倲
伟偉
㐽偑
侧側
侦偵
伪僞偽
㐷傌
杰<傑
伧傖
伞傘
备備
佣<傭
偬傯
传傳
伛傴
债債
伤傷
倾傾
偻僂
仅僅
佥僉
侨僑
仆<僕
侥僥
偾僨
价<價
仪儀
㑺儁
侬儂
亿億
侩儈
俭儉
傧儐
俦儔
侪儕
尽盡儘
偿償
优<優
储儲
俪儷
㑩儸
傩儺
傥儻
俨儼
兑兌
儿<兒
兖兗
内內
两兩
册冊
幂冪
净凈
冻凍
凛凜
凯凱
别別
删刪
刭剄
则則
克<剋
刹剎
刬剗
刚剛
剥剝
剐剮
剀剴
创創
划<劃
剧劇
刘劉
刽劊
刿劌
剑劍
㓥劏
剂劑
㔉劚
劲勁
动動
务務
勋勛
胜<勝
劳勞
势勢
勚勩
劢勱
励勵
劝勸
匀勻
匦匭
汇彙匯
匮匱
区區
协協
却卻
厍厙
厌厭
厉厲
厣厴
参參
叁叄
丛叢
咤>吒
吴吳
呐吶
吕呂
呙咼
员員
呗唄
吣唚
问問
哑啞
启啟
唡啢
㖞喎
唤喚
丧喪
乔喬
单單
哟喲
呛嗆
啬嗇
唝嗊
吗嗎
呜嗚
唢嗩
哔嗶
叹嘆
喽嘍
啯嘓
呕嘔
啧嘖
尝嘗
唛嘜
哗嘩
唠嘮
啸嘯
叽嘰
哓嘵
呒嘸
啴嘽
嘘噓
㖊噚
咝噝
哒噠
哝噥
哕噦
嗳噯
哙噲
喷噴
吨<噸
当當噹
咛嚀
吓嚇
哜嚌
噜嚕
啮嚙
呖嚦
咙嚨
亸嚲
喾嚳
严嚴
嘤嚶
啭囀
嗫囁
嚣囂
冁囅
呓囈
啰囉
嘱囑
囱囪
囵圇
国國
围圍
园園
圆圓
图圖
团團
埯垵
垭埡
采<採埰
执執
坚堅
垩堊
垴堖
埚堝
尧堯
报報
场場
块塊
茔塋
垲塏
埘塒
涂<塗
坞塢
埙塤
尘塵
堑塹
垫墊
坠墜
堕墮
坟墳
垯墶
垦墾
坛罈壇
垱壋
压壓
垒壘
圹壙
垆壚
坏<壞
垄壟
垅壠
坜壢
坝壩
塆壪
壮壯
壶壺
壸壼
寿壽
够夠
梦夢
夹夾
奂奐
奥奧
奁奩
夺奪
奨奬
奋奮
姹奼
妆妝
姗姍
奸<姦
娱娛
娄婁
妇婦
娅婭
娲媧
妫媯
㛀媰
媪媼
妈媽
妪嫗
妩嫵
娴嫻
婳嫿
媭嬃
娆嬈
婵嬋
娇嬌
嫱嬙
嫒嬡
嬷嬤
嫔嬪
婴嬰
婶嬸
㛤孋
娈孌
孙孫
学學
孪孿
宫宮
寝寢
实實
宁<寧
审審
写寫
宽寬
㝦寯
宠寵
宝寶
将將
专專
寻尋
对對
导導
尴尷
届屆
尸<屍
屃屓
屉屜
屡屢
层層
屦屨
属屬
冈岡
岘峴
岛島
峡峽
崃崍
岗崗
峥崢
岽崬
岚嵐
㟥嵾
嵝嶁
崭嶄
岖嶇
嵚嶔
崂嶗
峤嶠
峣嶢
峄嶧
崄嶮
岙嶴
嵘嶸
岭<嶺
屿嶼
岿巋
峦巒
巅巔
巯巰
帅帥
师師
帐帳
带帶
帧幀
帏幃
㡎幓
帼幗
帻幘
帜幟
币幣
帮幫
帱幬
么<麼>幺>麽
几<幾
库庫
厕廁
厢廂
厩廄
厦廈
厨廚
厮廝
庙廟
厂<廠
庑廡
废廢
广廣
廪廩
庐廬
厅廳
弑弒
弪弳
张張
强強
弹彈
弥彌
弯彎
彝<彞
彟彠
彦彥
彨彲
后<>後
径徑
从從
徕徠
复<複復>覆
征<>徵
彻徹
恒恆
耻恥
悦悅
悮悞
怅悵
闷悶
恶惡
恼惱
恽惲
恻惻
爱愛
惬愜
悫愨
怆愴
恺愷
忾愾
栗<慄
态態
愠慍
惨慘
惭慚
恸慟
惯慣
怄慪
怂慫
虑慮
悭慳
庆慶
㥪慺
忧憂
惫憊
㤭憍
怜<憐
凭憑
愦憒
慭憖
惮憚
愤憤
悯憫
怃憮
宪憲
忆憶
恳懇
应應
怿懌
懔懍
怼懟
懑懣
㤽懤
㤖懧
恹懨
惩懲
懒懶
怀<懷
悬懸
忏<懺
惧懼
慑懾
恋戀
戆戇
戋戔
戗戧
戬戩
战戰
戯戱
戏戲
户戶
抛拋
捝挩
挟挾
舍<捨
扪捫
扫掃
抡掄
㧏掆
挜掗
挣掙
挂<掛
拣揀
扬揚
换換
挥揮
损損
摇搖
捣搗
揾搵
抢搶
掴摑
掼摜
搂摟
挚摯
抠摳
抟摶
掺摻
捞撈
挦撏
撑撐
挠撓
㧑撝
挢撟
掸撣
拨撥
抚撫
扑<撲
揿撳
挞撻
挝撾
捡撿
拥擁
掳擄
择擇
击擊
挡擋
㧟擓
担擔
据<據
挤擠
㧛擥
拟擬
摈擯
拧擰
搁擱
掷擲
扩擴
撷擷
摆擺
擞擻
撸擼
㧰擽
扰<擾
摅攄
撵攆
拢攏
拦攔
撄攖
搀攙
撺攛
携攜
摄攝
攒攢
挛攣
摊攤
搅攪
揽攬
败敗
叙敘
敌敵
数數
敛斂
毙斃
敩斆
斓斕
斩斬
断斷
于<>於
时時
晋晉
昼晝
晕暈
晖暉
旸暘
畅暢
暂暫
晔曄
历歷曆
昙曇
晓曉
向<曏
暧曖
旷曠
昽曨
晒<曬
书書
会會
胧朧
东東
栅柵
杆<桿
栀梔
枧梘
条條
枭梟
棁梲
弃棄
枨棖
枣棗
栋棟
㭎棡
栈棧
栖<棲
梾棶
桠椏
㭏椲
杨楊
枫楓
桢楨
业業
极<極
杩榪
荣榮
榅榲
桤榿
构<構
枪槍
梿槤
椠槧
椁槨
椮槮
桨槳
椢槶
椝槼
桩樁
乐樂
枞樅
楼樓
标標
枢樞
㭤樢
样樣
㭴樫
桪樳
朴<樸
树樹
桦樺
椫樿
桡橈
桥橋
机<機
椭橢
横橫
檩檁
柽檉
档檔
桧檜
槚檟
检檢
樯檣
梼檮
台<颱臺檯
槟檳
柠檸
槛檻
柜<櫃
橹櫓
榈櫚
栉櫛
椟櫝
橼櫞
栎櫟
橱櫥
槠櫧
栌櫨
枥櫪
橥櫫
榇櫬
蘖櫱
栊櫳
榉櫸
樱櫻
栏欄
权權
椤欏
栾欒
榄欖
棂欞
钦欽
欧歐
欤歟
欢歡
岁歲
归歸
殁歿
残殘
殒殞
殇殤
㱮殨
殚殫
殓殮
殡殯
㱩殰
歼殲
杀殺
壳殼
毁毀
殴毆
毵毿
牦氂
毡氈
氇氌
气<氣
氢氫
氩氬
氲氳
决決
没沒
冲衝沖
况況
汹洶
浃浹
泾涇
凉涼
泪淚
渌淥
沦淪
渊淵
涞淶
浅淺
涣渙
减減
沨渢
涡渦
测測
浑渾
凑湊
浈湞
汤湯
沩溈
准<準
沟溝
温溫
浉溮
涢溳
沧滄
灭滅
涤滌
荥滎
沪滬
滞滯
渗滲
浒滸
浐滻
滚滾
满滿
渔漁
溇漊
沤漚
汉漢
涟漣
渍漬
涨漲
溆漵
渐漸
浆漿
颍潁
泼潑
洁<潔
㴋潚
潜潛
润潤
浔潯
溃潰
滗潷
涠潿
涩澀
浇澆
涝澇
涧澗
渑澠
泽澤
滪澦
泶澩
浍澮
淀<澱
㳠澾
浊濁
浓濃
㳡濄
湿濕
泞<濘
溁濚
浕濜
济濟
涛濤
㳔濧
滥濫
潍濰
滨濱
溅濺
泺濼
滤濾
澛瀂
滢瀅
渎瀆
㲿瀇
泻瀉
沈<瀋
浏瀏
濒瀕
泸瀘
沥瀝
潇瀟
潆瀠
潴瀦
泷瀧
濑瀨
㳽瀰
潋瀲
澜瀾
沣灃
滠灄
洒<灑
漓<灕
滩灘
灏灝
漤灠
㳕灡
湾灣
滦灤
滟灧
灾災
为為
乌烏
烃烴
无無
炼煉
炜煒
烟煙
茕煢
焕煥
烦煩
炀煬
㶽煱
煴熅
荧熒
炝熗
热熱
颎熲
炽熾
烨燁
灯燈
烧燒
烫燙
焖燜
营營
灿燦
烛燭
烩燴
㶶燶
烬燼
焘燾
烁爍
炉爐
烂爛
争爭
爷爺
尔爾
墙牆
牍牘
牵牽
荦犖
犊犢
牺犧
状狀
狭狹
狈狽
狰猙
犹猶
狲猻
犸獁
狱獄
狮獅
奖獎
独獨
狯獪
猃獫
狝獮
狞獰
㺍獱
获穫獲
猎獵
犷獷
兽獸
獭獺
献獻
猕獼
猡玀
现現
珐琺
珲琿
玮瑋
玚瑒
琐瑣
瑶瑤
莹瑩
玛瑪
玱瑲
琏璉
琎璡
玑璣
瑷璦
珰璫
㻅璯
环環
玙璵
瑸璸
玺璽
琼瓊
珑瓏
璎瓔
瓒瓚
瓯甌
产產
亩畝
毕畢
画畫
异<異
畴疇
叠疊
痉痙
疴痾
痖瘂
疯瘋
疡瘍
痪瘓
瘗瘞
疮瘡
疟瘧
瘆瘮
疭瘲
瘘瘺
疗療
痨癆
痫癇
瘅癉
疠癘
瘪癟
痒<癢
疖癤
症<癥
疬癧
癞癩
癣癬
瘿癭
瘾癮
痈癰
瘫癱
癫癲
发髮發
皑皚
疱皰
皲皸
皱皺
盗盜
盏盞
监監
盘盤
卢盧
荡蕩盪
眦眥
众眾
困<睏
睁睜
睐睞
眍瞘
䁖瞜
瞒瞞
瞆瞶
睑瞼
眬矓
瞩矚
矫矯
硁硜
硖硤
砗硨
砚硯
硕碩
砀碭
砜碸
确<確
码碼
䂵碽
硙磑
砖磚
硵磠
碜磣
碛磧
矶磯
硗磽
䃅磾
硚礄
硷鹼礆
础礎
碍礙
矿礦
砺礪
砾礫
矾礬
砻礱
禄祿
祸禍
祯禎
祎禕
祃禡
御<禦
禅禪
礼禮
祢禰
祷禱
秃禿
籼秈
税稅
秆稈
䅉稏
禀稟
种<種
称稱
谷<穀
䅟穇
稣穌
积積
颖穎
秾穠
穑穡
秽穢
稳穩
稆穭
窝窩
洼<窪
穷窮
窑窯
窎窵
窭窶
窥窺
窜竄
窍竅
窦竇
窃竊
竞競
笔筆
笋筍
笕筧
䇲筴
笺箋
筝箏
节節
范<範
筑<築
箧篋
筼篔
笃篤
筛篩
筚篳
箦簀
篓簍
箪簞
简簡
篑簣
箫簫
筜簹
签簽
帘<簾
篮籃
筹籌
䉤籔
箓籙
篯籛
箨籜
籁籟
笼籠
笾籩
簖籪
篱<籬
箩籮
粤粵
糁糝
粪糞
粮糧
粝糲
籴糴
粜糶
纟糹
纠糾
纪紀
纣紂
约約
红紅
纡紆
纥紇
纨紈
纫紉
纹紋
纳納
纽紐
纾紓
纯純
纰紕
纼紖
纱紗
纮紘
纸紙
级級
纷紛
纭紜
纴紝
纺紡
䌷紬
细細
绂紱
绁紲
绅紳
纻紵
绍紹
绀紺
绋紼
绐紿
绌絀
终終
组組
䌹絅
绊絆
绗絎
结結
绝絕
绦縧絛
绔絝
绞絞
络絡
绚絢
给給
绒絨
绖絰
统統
丝絲
绛絳
绢絹
绑綁
绡綃
绠綆
绨綈
绤綌
绥綏
䌼綐
经經
综綜
缍綞
绿綠
绸綢
绻綣
绶綬
维維
绹綯
绾綰
纲綱
网<網
缀綴
䌽綵
纶綸
绺綹
绮綺
绽綻
绰綽
绫綾
绵綿
绲緄
缁緇
紧緊
绯緋
绪緒
绬緓
绱鞝緔
缃緗
缄緘
缂緙
线線
缉緝
缎緞
缔締
缗緡
缘緣
缌緦
编編
缓緩
缅緬
纬緯
缑緱
缈緲
练練
缏緶
缇緹
致<緻
萦縈
缙縉
缢縊
缒縋
绉縐
缣縑
缊縕
缞縗
缚縛
缜縝
缟縞
缛縟
县縣
缝縫
缡縭
缩縮
纵縱
缧縲
䌸縳
缦縵
絷縶
缕縷
缥縹
总總
绩績
绷繃
缫繅
缪繆
缯繒
织織
缮繕
缭繚
绕繞
绣繡
缋繢
绳繩
绘繪
茧<繭
缰韁繮
缳繯
缲繰
缴繳
䍁繸
绎繹
继繼
缤繽
缱繾
䍀繿
颣纇
缬纈
纩纊
续續
累<纍
缠纏
缨纓
纤纖
缵纘
缆纜
钵缽
罂罌
罚罰
骂罵
罢罷
罗羅
罴羆
羁羈
芈羋
羟羥
义義
习習
翚翬
翘翹
翙翽
耧耬
耢耮
圣<聖
闻聞
联聯
聪聰
声聲
耸聳
聩聵
聂聶
职職
聍聹
听<聽
聋聾
肃肅
胁脅
脉脈
胫脛
脱脫
胀脹
肾腎
胨腖
脶腡
脑腦
肿腫
脚腳
肠腸
腽膃
腘膕
肤膚
䏝膞
胶膠
腻膩
胆膽
脍膾
脓膿
䐪臇
脸臉
脐臍
膑臏
腊<臘
胪臚
脏髒臟
脔臠
臜臢
临臨
与<與
兴興
举舉
旧舊
舱艙
舣艤
舰艦
舻艫
艰艱
艳艷
刍芻
苎苧
兹茲
荆荊
庄<莊
茎莖
荚莢
苋莧
华華
苌萇
莱萊
万<萬
荝萴
莴萵
叶葉
荭葒
着>著
荮葤
苇葦
荤葷
莳蒔
莅蒞
苍蒼
荪蓀
盖蓋
莲蓮
苁蓯
莼蓴
荜蓽
蒌蔞
蒋蔣
葱蔥
茑蔦
荫蔭
荨蕁
蒇蕆
荞蕎
荬蕒
芸<蕓
莸蕕
荛蕘
蒉蕢
芜蕪
萧蕭
蓣蕷
蕰薀
荟薈
蓟薊
芗薌
蔷薔
荙薘
莶薟
荐<薦
萨薩
䓕薳
苧<薴
䓓薵
荠薺
蓝藍
荩藎
艺藝
药藥
薮藪
苈藶
蔼藹
蔺藺
萚蘀
蕲蘄
芦蘆
苏蘇
蕴蘊
苹<蘋
藓蘚
蔹蘞
茏蘢
兰蘭
蓠蘺
萝蘿
蔂<虆
处處
虚虛
虏虜
号號
亏虧
虬虯
蛱蛺
蜕蛻
蚬蜆
蚀蝕
猬蝟
虾蝦
蜗蝸
蛳螄
蚂螞
萤螢
䗖螮
蝼螻
螀螿
蛰蟄
蝈蟈
螨蟎
虮<蟣
蝉蟬
蛲蟯
虫<蟲
蛏蟶
蚁蟻
蚃蠁
蝇蠅
虿蠆
蛴蠐
蝾蠑
蜡<蠟
蛎蠣
蟏蠨
蛊蠱
蚕<蠶
蛮蠻
术術
同<衕
胡<鬍衚
卫衛
衮袞
袅裊
补補
装裝
里<裡
制<製
裈褌
袆褘
裤褲
裢褳
褛褸
亵褻
裥襇
褝襌
袯襏
袄襖
裣襝
裆襠
褴襤
袜襪
䙓襬
衬襯
袭襲
襕襴
见見
觃覎
规規
觅覓
视視
觇覘
觋覡
觍覥
觎覦
亲親
觊覬
觏覯
觐覲
觑覷
觉覺
览覽
觌覿
观觀
觞觴
觯觶
触<觸
讠訁
订訂
讣訃
计計
讯訊
讧訌
讨討
讦訐
讱訒
训訓
讪訕
讫訖
讬託
记記
讹訛
讶訝
讼訟
䜣訢
诀訣
讷訥
讻訩
访訪
设設
许許
诉訴
诃訶
诊診
注<註
诂詁
诋詆
讵詎
诈詐
诒詒
诏詔
评評
诐詖
诇詗
诎詘
诅詛
词詞
咏詠
诩詡
询詢
诣詣
试試
诗詩
诧詫
诟詬
诡詭
诠詮
诘詰
话話
该該
详詳
诜詵
诙詼
诖詿
诔誄
诛誅
诓誆
夸<誇
志<誌
认認
诳誑
诶誒
诞誕
诱誘
诮誚
语語
诚誠
诫誡
诬誣
误誤
诰誥
诵誦
诲誨
说說
谁誰
课課
谇誶
诽誹
谊誼
訚誾
调調
谄諂
谆諄
谈談
诿諉
请請
诤諍
诹諏
诼諑
谅諒
论論
谂諗
谀諛
谍諜
谞諝
谝諞
诨諢
谔諤
谛諦
谐諧
谏諫
谕諭
谘諮
讳諱
谙諳
谌諶
讽諷
诸諸
谚諺
谖諼
诺諾
谋謀
谒謁
谓謂
誊謄
诌謅
谎謊
谜謎
谧謐
谑謔
谡謖
谤謗
谦謙
谥謚
讲講
谢謝
谣謠
谟謨
谪謫
谬謬
谫譾謭
讴謳
谨謹
谩謾
证證
谲譎
讥譏
谮譖
识識
谯譙
谭譚
谱譜
谵譫
译譯
议議
谴譴
护護
诪譸
䛓譼
誉譽
读讀
谉讅
变變
詟讋
䜩讌
雠讎
谗讒
让讓
谰讕
谶讖
谠讜
谳讞
岂豈
竖豎
丰<豐
猪豬
豮豶
猫貓
䝙貙
贝貝
贞貞
贠貟
负負
财財
贡貢
贫貧
货貨
贩販
贪貪
贯貫
责責
贮貯
贳貰
赀貲
贰貳
贵貴
贬貶
买買
贷貸
贶貺
费費
贴貼
贻貽
贸貿
贺賀
贲賁
赂賂
赁賃
贿賄
赅賅
资資
贾賈
贼賊
赈賑
赊賒
宾賓
赇賕
赒賙
赉賚
赐賜
赏賞
赔賠
赓賡
贤賢
卖賣
贱賤
赋賦
赕賧
质質
账賬
赌賭
䞐賰
赖賴
赗賵
赚賺
赙賻
购購
赛賽
赜賾
贽贄
赘贅
赟贇
赠贈
赞贊
赝贗贋
赡贍
赢贏
赆贐
赃贓
赑贔
赎贖
赣贛
赪赬
赶<趕
赵趙
趋趨
趱趲
迹跡
践踐
踊<踴
跄蹌
跸蹕
蹒蹣
踪蹤
跷蹺
跶躂
趸躉
踌躊
跻躋
跃躍
䟢躎
踯躑
跞躒
踬躓
蹰躕
跹躚
蹑躡
蹿躥
躜躦
躏躪
躯軀
车車
轧軋
轨軌
军軍
轪軑
轩軒
轫軔
轭軛
软軟
轷軤
轸軫
轱軲
轴軸
轵軹
轺軺
轲軻
轶軼
轼軾
较較
辂輅
辁輇
辀輈
载載
轾輊
辄輒
挽<輓
辅輔
轻輕
辆輛
辎輜
辉輝
辋輞
辍輟
辊輥
辇輦
辈輩
轮輪
辌輬
辑輯
辏輳
输輸
辐輻
辗輾
舆輿
辒轀
毂轂
辖轄
辕轅
辘轆
转轉
辙轍
轿轎
辚轔
轰轟
辔轡
轹轢
轳轤
办辦
辞辭
辫辮
辩辯
农農
迳逕
这這
连連
进進
运運
过過
达達
违違
遥遙
逊遜
递遞
远遠
适<適
迟遲
迁遷
选選
遗遺
辽遼
迈邁
还還
迩邇
边邊
逻邏
逦邐
郏郟
邮郵
郓鄆
乡鄉
邹鄒
邬鄔
郧鄖
邓鄧
郑鄭
邻鄰
郸鄲
邺鄴
郐鄶
邝鄺
酂酇
郦酈
丑<醜
酝醞
医醫
酱醬
酦醱
酿釀
衅釁
酾釃
酽釅
释釋
厘<釐
钅釒
钆釓
钇釔
钌釕
钊釗
钉釘
钋釙
针針
钓釣
钐釤
钏釧
钒釩
钗釵
钍釷
钕釹
钎釺
䥺釾
钯鈀
钫鈁
钘鈃
钭鈄
钚鈈
钠鈉
钝鈍
钩鉤鈎
钤鈐
钣鈑
钑鈒
钞鈔
钮鈕
钧鈞
钙鈣
钬鈥
钛鈦
钪鈧
铌鈮
铈鈰
钶鈳
铃鈴
钴鈷
钹鈸
铍鈹
钰鈺
钸鈽
铀鈾
钿鈿
钾鉀
钜鉅
铊鉈
铉鉉
铇鉋
铋鉍
铂鉑
钷鉕
钳鉗
铆鉚
铅鉛
钺鉞
钲鉦
鿭鑈鉨
钼鉬
钽鉭
铏鉶
铰鉸
铒鉺
铬鉻
铪鉿
银銀
铳銃
铜銅
铚銍
铣銑
铨銓
铢銖
铭銘
铫銚
铦銛
衔銜
铑銠
铷銣
铱銥
铟銦
铵銨
铥銩
铕銪
铯銫
铐銬
铞銱
锐銳
销銷
锈鏽銹
锑銻
锉銼
铝鋁
锒鋃
锌鋅
钡鋇
铤鋌
铗鋏
锋鋒
铻鋙
锊鋝
锓鋟
铘鋣
锄鋤
锃鋥
锔鋦
锇鋨
铓鋩
铺鋪
铖鋮
锆鋯
锂鋰
铽鋱
锍鋶
锯鋸
钢鋼
锞錁
录錄
锖錆
锫錇
锩錈
铔錏
锥錐
锕錒
锟錕
锤錘
锱錙
铮錚
锛錛
锬錟
锭錠
锜錡
钱錢
锦錦
锚錨
锠錩
锡錫
锢錮
错錯
锰錳
表<錶
铼錸
锝鍀
锨鍁
锪鍃
钔鍆
锴鍇
锳鍈
锅鍋
镀鍍
锷鍔
铡鍘
钖鍚
锻鍛
锽鍠
锸鍤
锲鍥
锘鍩
锹鍬
锾鍰
键鍵
锶鍶
锗鍺
钟鐘鍾
镁鎂
锿鎄
镅鎇
镑鎊
镕鎔
锁鎖
镉鎘
镈鎛
镃鎡
钨鎢
蓥鎣
镏鎦
铠鎧
铩鎩
锼鎪
镐鎬
镇鎮
镒鎰
镋鎲
镍鎳
镓鎵
鿔鎶
镎鎿
镞鏃
镟鏇
链鏈
镆鏌
镙鏍
镠鏐
镝鏑
铿鏗
锵鏘
镗鏜
镘鏝
镛鏞
铲鏟
镜鏡
镖鏢
镂鏤
錾鏨
镚鏰
铧鏵
镤鏷
镪鏹
䥽鏺
铙鐃
铴鐋
镣鐐
铹鐒
镦鐓
镡鐔
镫鐙
镢鐝
镨鐠
䦅鐥
锎鐦
锏鐧
镄鐨
镌鐫
镰鐮
䦃鐯
镯鐲
镭鐳
铁鐵
镮鐶
铎鐸
铛鐺
镱鐿
铸鑄
镬鑊
镔鑌
鉴鑒
镲鑔
锧鑕
镴鑞
铄鑠
镳鑣
镥鑥
镧鑭
钥鑰
镵鑱
镶鑲
镊鑷
镩鑹
锣鑼
钻鑽
銮鑾
凿鑿
䦆钁
长長
门門
闩閂
闪閃
闫閆
闬閈
闭閉
开開
闶閌
闳閎
闰閏
闲閒閑
间間
闵閔
闸閘
阂閡
阁閣
阀閥
闺閨
闽閩
阃閫
阆閬
闾閭
阅閱
阊閶
阉閹
阎閻
阏閼
阍閽
阈閾
阌閿
阒闃
板<闆
闱闈
阔闊
阕闋
阑闌
阇闍
阗闐
阘闒
闿闓
阖闔
阙闕
闯闖
关關
阚闞
阓闠
阐闡
辟<闢
阛闤
闼闥
坂>阪
陉陘
陕陝
阵陣
阴陰
陈陳
陆陸
阳陽
陧隉
队隊
阶階
陨隕
际際
随隨
险險
陦隯
隐隱
陇隴
隶隸
只<隻
隽雋
虽雖
双雙
雏雛
杂雜
鸡雞
离<離
难難
云<雲
电電
霡霢
雾霧
霁霽
雳靂
霭靄
叇靆
灵靈
叆靉
靓靚
静靜
䩄靦
靥靨
鼗鞀
巩鞏
鞒鞽
鞑韃
鞯韉
韦韋
韧韌
韨韍
韩韓
韪韙
韬韜
韫韞
韵韻
响響
页頁
顶頂
顷頃
项項
顺順
顸頇
须鬚須
顼頊
颂頌
颀頎
颃頏
预預
顽頑
颁頒
顿頓
颇頗
领領
颌頜
颉頡
颐頤
颏頦
头頭
颒頮
颊頰
颋頲
颕頴
颔頷
颈頸
颓頹
频頻
颗顆
题題
额額
颚顎
颜顏
颙顒
颛顓
愿<願
颡顙
颠顛
类類
颟顢
颢顥
顾顧
颤顫
颥顬
显顯
颦顰
颅顱
颞顳
颧顴
风風
飐颭
飑颮
飒颯
刮<颳
飓颶
飔颸
飏颺
飖颻
飕颼
飗飀
飘飄
飙飆
飚飈
飞飛
饣飠
饥飢
饤飣
饦飥
饨飩
饪飪
饫飫
饬飭
饭飯
饮飲
饴飴
饲飼
饱飽
饰飾
饳飿
饺餃
饸餄
饼餅
饷餉
养養
饵餌
饹餎
饻餏
饽餑
馁餒
饿餓
馂餕
饾餖
余<餘
肴<餚
馄餛
馃餜
饯餞
馅餡
馆館
糇餱
饧餳
馉餶
馇餷
馎餺
饩餼
馏餾
馊餿
馌饁
馍饃
馒饅
馐饈
馑饉
馓饊
馈饋
馔饌
饶饒
飨饗
餍饜
馋饞
馕饢
马馬
驭馭
冯馮
驮馱
驰馳
驯馴
驲馹
驳駁
驻駐
驽駑
驹駒
驵駔
驾駕
骀駘
驸駙
驶駛
驼駝
驷駟
骈駢
骇駭
骃駰
骆駱
骎駸
骏駿
骋騁
骍騂
骓騅
骔騌
骒騍
骑騎
骐騏
骛騖
骗騙
骙騤
䯄騧
骞騫
骘騭
骝騮
腾騰
驺騶
骚騷
骟騸
骡騾
蓦驀
骜驁
骖驂
骠驃
骢驄
驱驅
骅驊
骕驌
骁驍
骣驏
骄驕
验驗
惊<驚
驿驛
骤驟
驴驢
骧驤
骥驥
骦驦
骊驪
骉驫
肮<骯
髅髏
体<體
髌髕
髋髖
松<鬆
鬓鬢
斗<鬥
闹鬧
阋鬩
阄鬮
郁<鬱
鬶鬹
魉魎
魇魘
鱼魚
鱽魛
鱾魢
鲀魨
鲁魯
鲂魴
鱿魷
鲄魺
鲅鮁
鲆鮃
鲌鮊
鲉鮋
鲏鮍
鲇鮎
鲐鮐
鲍鮑
鲋鮒
鲊鮓
鲒鮚
鲘鮜
鲕鮞
䲟鮣
鲖鮦
鲔鮪
鲛鮫
鲑鮭
鲜鮮
鲓鮳
鲪鮶
鲝鮺
鲧鯀
鲠鯁
鲩鯇
鲤鯉
鲨鯊
鲬鯒
鲻鯔
鲯鯕
鲭鯖
鲞鯗
鲷鯛
鲴鯝
鲱鯡
鲵鯢
鲲鯤
鲳鯧
鲸鯨
鲮鯪
鲰鯫
鲶鯰
鲺鯴
鳀鯷
鲫鯽
鳊鯿
鳈鰁
鲗鰂
鳂鰃
䲠鰆
鲽鰈
鳇鰉
䲡鰌
鳅鰍
鲾鰏
鳄鱷鰐
鳆鰒
鳃鰓
鳒鰜
鳑鰟
鳋鰠
鲥鰣
鳏鰥
䲢鰧
鳎鰨
鳐鰩
鳍鰭
鳁鰮
鲢鰱
鳌鰲
鳓鰳
鳘鰵
鲦鰷
鲣鰹
鲹鰺
鳗鰻
鳛鰼
鳔鰾
鳉鱂
鳙鱅
鳕鱈
鳖鱉
鳟鱒
鳝鱔
鳜鱖
鳞鱗
鲟鱘
鲼鱝
鲎鱟
鲙鱠
鳣鱣
鳡鱤
鳢鱧
鲿鱨
鲚鱭
鳠鱯
鲈鱸
鲡鱺
鸟鳥
凫鳧
鸠鳩
鸤鳲
凤鳳
鸣鳴
鸢鳶
䴓鳾
鸩鴆
鸨鴇
鸦鴉
鸰鴒
鸵鴕
鸳鴛
鸲鴝
鸮鴞
鸱鴟
鸪鴣
鸯鴦
鸭鴨
鸸鴯
鸹鴰
鸻鴴
䴕鴷
鸿鴻
鸽鴿
䴔鵁
鸺鵂
鸼鵃
鹀鵐
鹃鵑
鹆鵒
鹁鵓
鹈鵜
鹅鵝
鹄鵠
鹉鵡
鹌鵪
鹏鵬
鹐鵮
鹎鵯
鹊鵲
鹓鵷
鹍鵾
䴖鶄
鸫鶇
鹑鶉
鹒鶊
鹋鶓
鹙鶖
鹕鶘
鹗鶚
鹖鶡
鹛鶥
鹜鶩
䴗鶪
鸧鶬
莺鶯
鹟鶲
鹤鶴
鹠鶹
鹡鶺
鹘鶻
鹣鶼
鹚鷀
鹢鷁
鹞鷂
䴘鷉鷈
鹝鷊
鹧鷓
鹥鷖
鸥鷗
鸷鷙
鹨鷚
鸶鷥
鹪鷦
鹔鷫
鹩鷯
鹫鷲
鹇鷳
鹬鷸
鹰鷹
鹭鷺
鸴鷽
䴙鸊鷿
㶉鸂
鹯鸇
鹱鸌
鹲鸏
鸬鸕
鹴鸘
鹦鸚
鹳鸛
鹂鸝
鸾鸞
卤鹵
咸<鹹
鹾鹺
盐鹽
丽麗
麦麥
麸麩
曲<麯
麹>麴
面<麵
黄黃
黉黌
点點
党<黨
黪黲
黡黶
黩黷
黾黽
鼋黿
鼍鼉
鼹鼴
齐齊
斋齋
赍齎
齑齏
齿齒
龀齔
龁齕
龂齗
龅齙
龇齜
龃齟
龆齠
龄齡
出<齣
龈齦
龊齪
龉齬
龋齲
腭齶
龌齷
龙龍
厐龎
庞龐
䶮龑
龚龔
龛龕
龟龜
䜤鿁
䲤鿐
鿓鿒`;

var mapping = sc2tc.split(/\r?\n/);
mapping.push('“「');
mapping.push('‘『');
mapping.push('”」');
mapping.push('’』');
/*
伪=偽僞   //對應兩個繁體字
㐷=傌     //gb 與 big5 一對一 (繁體無㐷字)
杰~傑     //繁體有「杰」字
*/
var overwrite = { "获": "獲穫", "缰": "繮韁", "赝": "贋贗", "伪": "僞偽", "汇": "匯彙", "坛": "壇罈", "台": "臺颱檯",
    "冲": "沖衝", "硷": "礆鹼", "绱": "緔鞝", "脏": "臟髒", "谫": "謭譾", "钩": "鈎鉤", "鿭": "鉨鑈",
    "锈": "銹鏽", "闲": "閑閒", "须": "須鬚", "鳄": "鰐鱷" };
var t2s = {}, t2s_unsafe1 = {}, s2t = {};
mapping.forEach(function (line, idx) {
    var r = line.match(/(.)(<?)(.+)/u);
    if (!r)
        throw 'wrong data format ' + idx;
    r[0]; var sc = r[1], op = r[2], tc = r[3];
    var oldtc = tc;
    if (overwrite[sc])
        tc = overwrite[sc];
    if (op == '') {
        if (tc.length == 1) { //完美一對一 //左邊的字只有gb收，右邊只有big5收
            t2s[tc] = sc;
        }
        else {
            if (tc[0] == '>') { //只有4個   着>著 , 坂>阪
                t2s_unsafe1[tc.substring(1)] = sc;
            }
            else { //假設只有
                //历歷曆  , 发髮發 , 脏臟髒
                t2s[tc[0]] = sc; //第一個繁體可以安全轉到簡體
                tc = tc.substring(1);
                for (var i = 0; i < tc.length; i++) { //目前只有一個
                    var cp = tc.codePointAt(i); //考慮未來 surrogate
                    if (!cp)
                        break;
                    t2s_unsafe1[String.fromCodePoint(cp)] = sc;
                }
            }
        }
    }
    else {
        if (tc.length == 1) { // 圣聖  听聽  同衕  云雲  松鬆  体體  咸鹹
            t2s_unsafe1[tc] = sc; //簡字也在big5中
        }
        else {
            while (tc && tc[0] !== '>') { //干幹>乾  台臺<颱檯 
                //接受 幹=>干 ,臺=>台 
                var ch = String.fromCodePoint(tc.codePointAt(0));
                t2s_unsafe1[ch] = sc;
                tc = tc.substring(ch.length);
            }
            //最後剩六組  干乾  后後  复覆 征徵  于於  么幺麽
            //繁體都收，不轉換
        }
    }
    tc = oldtc.replace(/\>/g, '');
    if (op == '<') {
        s2t[sc] = tc.replace(sc, '') + sc; //簡字也可能是繁字 ， 簡字「面」 可能是繁字的「麵」或「面」
    }
    else
        s2t[sc] = tc;
});
var toSim = function (s, mode) {
    if (mode === void 0) { mode = 1; }
    if (!s)
        return s;
    var out = '', i = 0;
    if (!mode)
        return s;
    while (i < s.length) {
        var cp = s.codePointAt(i);
        var ucs4 = String.fromCodePoint(cp);
        if (!ucs4)
            break;
        var sc = t2s[ucs4];
        if (mode == 2 && !sc)
            sc = t2s_unsafe1[ucs4];
        out += sc || ucs4;
        i++;
        if (cp > 0xffff)
            i++;
    }
    return out;
};
var fromSim = function (s, mode, bracket) {
    if (mode === void 0) { mode = 1; }
    if (bracket === void 0) { bracket = '()'; }
    var out = '', i = 0;
    if (!mode || !s)
        return s;
    while (i < s.length && s[i]) { //對每一個ucs4
        var cp = s.codePointAt(i);
        var ucs4 = String.fromCodePoint(cp);
        if (!ucs4)
            break;
        var tc = s2t[ucs4];
        if (!tc) {
            out += ucs4; //沒有繁體
        }
        else if (mode == 1 && !tc.codePointAt(1)) { //一對一
            out += tc;
        }
        else if (mode == 2) {
            out += String.fromCodePoint(tc.codePointAt(0)); //選第一個
        }
        else if (mode == 3) { //展開
            if (tc.codePointAt(1))
                out += bracket[0] + tc + bracket[1];
            else
                out += tc;
        }
        else
            out += ucs4; //保留不變
        i++;
        if (cp > 0xffff)
            i++;
    }
    return out;
};

var Inverted = /** @class */ (function () {
    function Inverted(section, postingStart) {
        this.words = new StringArray(section.shift(), { sep: LEMMA_DELIMITER });
        this.bmpwithposting = unpackIntDelta(section.shift());
        this.tokenlinepos = unpackIntDelta(section.shift());
        this.postings = []; //holding loaded postings
        this.postingStart = postingStart;
        this.bmppostingcount = 0; //long token starts from here
        for (var i = 1; i < 65536; i++) { //ascii 0 is not used
            if (this.bmpwithposting[i])
                this.bmppostingcount++;
        }
    }
    Inverted.prototype.nPostingOf = function (s) {
        var out = [];
        var tokens = tokenize$1(s);
        for (var i = 0; i < tokens.length; i++) {
            var _a = tokens[i], type = _a.type, text = _a.text;
            var at = -1;
            if (type == exports.TokenType.CJK_BMP) {
                var cp = text.charCodeAt(0);
                at = bsearchNumber(this.bmpwithposting, cp);
                if (this.bmpwithposting[at] !== cp) {
                    //try sim
                    var cpsim = fromSim(text).charCodeAt(0);
                    at = bsearchNumber(this.bmpwithposting, cpsim);
                    if (this.bmpwithposting[at] !== cpsim)
                        continue;
                }
            }
            else if (type >= exports.TokenType.SEARCHABLE) {
                if (~at)
                    at += this.bmppostingcount;
                else {
                    var at2 = this.words.find(s);
                    if (~at2)
                        at = at2 + this.bmppostingcount;
                }
            }
            out.push(at);
        }
        return out;
    };
    return Inverted;
}());

var counter = 0, maxspeed = 0;
/*inspired by https://github.com/Siderite/SortedArrayIntersect AcceleratingIntersercter*/
var plFind = function (arr, v, p) {
    if (p === void 0) { p = 0; }
    var speed = 1;
    var p2 = p;
    while (p2 < arr.length) {
        if (v > arr[p2]) {
            speed++;
            if (speed > maxspeed)
                maxspeed = speed;
        }
        else {
            if (speed <= 1)
                break;
            p2 -= speed;
            speed = 1;
        }
        p2 += speed;
        counter++;
    }
    return p2;
};
var plAnd = function (pl1, pl2, dist) {
    if (dist === void 0) { dist = 1; }
    var p2 = 0, c = 0;
    if (!pl1 || !pl2 || pl1.length == 0 || pl2.length == 0)
        return [];
    Math.min(pl1.length, pl2.length);
    var out = [];
    for (var p1 = 0; p1 < pl1.length; p1++) {
        var v1 = pl1[p1] + dist;
        var v2 = pl2[p2];
        while (v1 > v2 && p2 < pl2.length)
            v2 = pl2[++p2];
        if (v1 === v2) {
            out[c++] = v1 - dist;
        }
    }
    return out.slice(0, c);
};
var plCount = function (pl, plgroup) {
    var p = 0, start = 0, end = 0;
    var out = [];
    for (var i = 0; i < plgroup.length; i++) {
        var _a = plgroup[i], from = _a[0], to = _a[1];
        start = p;
        //search this book than ak
        if (from > pl[p])
            start = plFind(pl, from, p);
        end = start;
        while (pl[end] < to && end < pl.length)
            end++;
        if (end > start) {
            out[i] = end - start;
        }
        else
            out[i] = 0;
        p = end;
    }
    for (var i = 0; i < out.length; i++) {
        if (typeof out[i] !== 'number')
            out[i] = 0;
    }
    return out;
};
var plTrim = function (pl, from, to) {
    var at1 = bsearchNumber(pl, from);
    var at2 = bsearchNumber(pl, to) + 1;
    var out = pl.slice(at1, at2);
    while (out[0] < from)
        out.shift();
    while (out[out.length - 1] > to)
        out.pop();
    return out;
};
var plRanges = function (posting, ranges) {
    if (!ranges || !ranges.length)
        return posting;
    var out = [];
    var j = 0, r = ranges[j];
    for (var i = 0; i < posting.length; i++) {
        var p = posting[i];
        if (p >= r[0] && r[1] >= p)
            out.push(p);
        while (p > r[0] && j < ranges.length - 1) {
            r = ranges[++j];
        }
        if (j >= ranges.length)
            break;
    }
    return out;
};
var plContain = function (posting, ltp, withHits) {
    if (withHits === void 0) { withHits = false; }
    var i = 0;
    var lines = [], hits = [];
    while (i < posting.length) {
        var p_1 = posting[i];
        var at = bsearchNumber(ltp, p_1);
        if (at >= 0 && at < ltp.length) {
            if (lines[lines.length - 1] !== at) {
                lines.push(at);
            }
            if (withHits) {
                if (!hits[lines.length - 1])
                    hits[lines.length - 1] = [];
                hits[lines.length - 1].push(p_1 - ltp[at - 1]);
            }
            p_1 = posting[i];
        }
        i++;
    }
    return [lines, hits];
};
var getCounter = function () { return counter; };
var getSpeed = function () { return maxspeed; };
var resetCounter = function () { return counter = 0; };

function loadPostingsSync(s) {
    var ptk = this;
    var nPostings = ptk.inverted.nPostingOf(s);
    for (var i = 0; i < nPostings.length; i++) {
        var at = nPostings[i];
        if (at == -1)
            continue;
        var line = ptk.inverted.postingStart + nPostings[i];
        if (!ptk.inverted.postings[at]) {
            var packedline = ptk.getLine(line);
            ptk.inverted.postings[at] = unpackIntDelta(packedline);
        }
    }
    return this.getPostings(s);
}
function getPostings(s) {
    var nPostings = this.inverted.nPostingOf(s);
    var postings = this.inverted.postings;
    return nPostings.map(function (np) { return postings[np]; });
}
var loadPostinglines = function (ptk, s) { return __awaiter(void 0, void 0, void 0, function () {
    var nPostings, postinglines, i, line;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!ptk.inverted)
                    return [2 /*return*/];
                nPostings = ptk.inverted.nPostingOf(s);
                postinglines = [];
                for (i = 0; i < nPostings.length; i++) {
                    if (nPostings[i] < 0)
                        continue;
                    line = ptk.inverted.postingStart + nPostings[i];
                    postinglines.push([line, line + 1]);
                }
                //must sort for combineRange
                postinglines.sort(function (a, b) { return a[0] - b[0]; });
                return [4 /*yield*/, ptk.loadLines(postinglines)];
            case 1:
                _a.sent();
                return [2 /*return*/, postinglines];
        }
    });
}); };
function loadPostings(s) {
    return __awaiter(this, void 0, void 0, function () {
        var ptk;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ptk = this;
                    return [4 /*yield*/, loadPostinglines(ptk, s)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, ptk.loadPostingsSync.call(ptk, s)];
            }
        });
    });
}

var listExcerpts = function (ptk_1, tofind_1) {
    var args_1 = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args_1[_i - 2] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([ptk_1, tofind_1], args_1, true), void 0, function (ptk, tofind, opts) {
        var tlp, sectionfrom, sectionto, _a, first, last, _b, phrases, postings, chunkobj, lineobj, hitcount, chunklinepos, chunktag, _loop_1, i, lines, chunks;
        var _c;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!ptk)
                        return [2 /*return*/, {}];
                    tlp = (_c = ptk.inverted) === null || _c === void 0 ? void 0 : _c.tokenlinepos;
                    if (!tlp)
                        return [2 /*return*/, {}];
                    sectionfrom = 0, sectionto = 0;
                    if (opts.range) {
                        _a = ptk.rangeOfAddress(opts.range), first = _a[0], last = _a[1];
                        sectionfrom = tlp[first];
                        sectionto = tlp[last];
                    }
                    else {
                        sectionfrom = tlp[0];
                        sectionto = tlp[ptk.header.eot];
                    }
                    return [4 /*yield*/, ptk.parseQuery(tofind, { tosim: ptk.attributes.lang == 'zh' })];
                case 1:
                    _b = _d.sent(), phrases = _b[0], postings = _b[1];
                    chunkobj = {}, lineobj = {}, hitcount = 0;
                    chunklinepos = (ptk.defines.ck || ptk.defines.dk).linepos;
                    chunktag = ptk.defines.ck ? 'ck' : 'dk';
                    _loop_1 = function (i) {
                        var _e;
                        var pl = plTrim(postings[i], sectionfrom, sectionto);
                        var _f = plContain(pl, ptk.inverted.tokenlinepos, true), pllines = _f[0], lineshits = _f[1];
                        var phraselen = phrases[i].length;
                        hitcount += pl.length;
                        for (var j = 0; j < pllines.length; j++) {
                            var line = pllines[j];
                            var removed = false;
                            if (opts.includelines) {
                                var at_1 = bsearchNumber(opts.includelines, line);
                                if (opts.includelines[at_1] !== line)
                                    removed = true;
                            }
                            if (opts.excludelines) {
                                var at_2 = bsearchNumber(opts.excludelines, line);
                                if (opts.excludelines[at_2] == line)
                                    removed = true;
                            }
                            if (removed)
                                continue;
                            if (!lineobj[line])
                                lineobj[line] = [];
                            (_e = lineobj[line]).push.apply(_e, lineshits[j].map(function (it) { return it * MAXPHRASELEN + phraselen; }));
                            var at = bsearchNumber(chunklinepos, line + 1) - 1;
                            if (!chunkobj[at]) {
                                chunkobj[at] = 0;
                            }
                            chunkobj[at]++;
                        }
                    };
                    for (i = 0; i < postings.length; i++) {
                        _loop_1(i);
                    }
                    lines = fromObj(lineobj, function (a, b) { return [parseInt(a), b.sort()]; }).sort(function (a, b) { return a[0] - b[0]; });
                    chunks = fromObj(chunkobj, function (a, b) { return [parseInt(a), b]; }).sort(function (a, b) { return b[1] - a[1]; });
                    return [2 /*return*/, { lines: lines, chunks: chunks, phrases: phrases, postings: postings, chunktag: chunktag }];
            }
        });
    });
};

var TOFIND_MAXLEN = 50;
var MAX_PHRASE = 5;
var scoreMatch = function (matching, weights) {
    if (matching.length == 0)
        return 0;
    var score = 0, matchcount = 0;
    for (var j = 0; j < weights.length; j++) {
        if (matching[j]) {
            matchcount++;
            score += weights[j] * (matching[j] > 1 ? Math.sqrt(matching[j]) : 1); //出現一次以上，效用递減
        }
    }
    var boost = (matchcount / weights.length);
    boost *= boost; // 有兩個詞，只有一個詞有hit ，那boost只有 0.25。
    return score * boost;
};
function scoreLine(postings, chunklinepos, tlp) {
    tlp = tlp || this.inverted.tokenlinepos, tlplast = tlp[tlp.length - 1];
    chunklinepos = chunklinepos || this.defines.ck.linepos;
    var averagelinelen = tlplast / tlp.length;
    var allhits = postings.reduce(function (acc, i) { return i.length + acc; }, 0);
    var weights = postings.map(function (pl) { return Math.sqrt(allhits / pl.length); });
    var i = 0, scoredLine = [];
    var ptr = new Array(postings.length);
    ptr.fill(0);
    var prev = 0;
    while (i < tlp.length - 1) { //sum up all Postings 
        var nearest = tlplast;
        var from = tlp[i], to = tlp[i + 1];
        var matching = [];
        prev = 0;
        for (var j = 0; j < postings.length; j++) {
            var pl = postings[j];
            var v = pl[ptr[j]];
            while (v < from && ptr[j] < pl.length) {
                ptr[j]++;
                v = pl[ptr[j]];
            }
            while (v >= from && v < to) {
                if (!matching[j])
                    matching[j] = 0;
                matching[j]++; //each hit has a base score 1
                if (j == 0)
                    prev = v; // score closer token
                else {
                    var dist = v - prev - j;
                    if (dist == 0) { //immediate prev token
                        matching[j] += 3;
                    }
                    else {
                        matching[j] += 1 / dist;
                    }
                }
                ptr[j]++;
                v = pl[ptr[j]];
            }
            if (nearest > v)
                nearest = v;
        }
        var score = scoreMatch(matching, weights);
        //boost single phrase search with linelen, shorter line get higher score
        var shortpara = 10 * (averagelinelen / (to - from + 1)); //short para get value > 1
        if (shortpara < 10)
            shortpara = 10;
        //出現次數相同，較短的段落優先
        var boost = Math.log(shortpara); //boost 不小於 1
        if (score > 0) {
            var chunk = bsearchNumber(chunklinepos, i) - 1;
            scoredLine.push([i + 1, score * boost, chunk]); //y is 1 base
        }
        i++;
        while (nearest > tlp[i + 1])
            i++;
    }
    scoredLine = scoredLine.sort(function (a, b) { return b[1] - a[1]; });
    return scoredLine;
}
function phraseQuerySync(phrase, tokens) {
    if (tokens === void 0) { tokens = null; }
    tokens = tokens || this.loadPostingsSync(phrase);
    if (!tokens)
        return [];
    phrase = phrase.trim();
    var qkey = this.name + '@' + phrase;
    var out = this.queryCache[qkey];
    if (out)
        return out;
    out = tokens[0];
    for (var i = 1; i < tokens.length; i++) {
        var pl1 = out;
        out = plAnd(pl1, tokens[i], i);
    }
    this.queryCache[qkey] = out || [];
    return this.queryCache[qkey];
}
function phraseQuery(phrase) {
    return __awaiter(this, void 0, void 0, function () {
        var tokens;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, this.loadPostings(phrase)];
                case 1:
                    tokens = _a.sent();
                    if (!tokens)
                        return [2 /*return*/, []];
                    return [2 /*return*/, phraseQuerySync.call(this, phrase, tokens)];
            }
        });
    });
}
function parseQuery(tofind, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var phrases, outphrases, postings, i, posting;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    opts = opts || {};
                    phrases = tofind.split(/[, 　]/);
                    if (phrases.length > MAX_PHRASE)
                        phrases.length = MAX_PHRASE;
                    outphrases = [], postings = [];
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < phrases.length)) return [3 /*break*/, 6];
                    if (!phrases[i].trim())
                        return [3 /*break*/, 5];
                    return [4 /*yield*/, phraseQuery.call(this, phrases[i])];
                case 2:
                    posting = _a.sent();
                    if (!((!posting || !posting.length) && this.attributes.lang == 'zh')) return [3 /*break*/, 4];
                    return [4 /*yield*/, phraseQuery.call(this, fromSim(phrases[i]))];
                case 3:
                    posting = _a.sent();
                    _a.label = 4;
                case 4:
                    if (opts.ranges && opts.ranges.length) { //only search in ranges
                        posting = plRanges(posting, opts.ranges);
                    }
                    outphrases.push(phrases[i]);
                    postings.push(posting || []);
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, [outphrases, postings]];
            }
        });
    });
}
function scanText(tofind, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var ptk, _a, postings, tagname, groupby, tlp, TLP, i, nextstart, res, i, res1, j, out;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ptk = this;
                    return [4 /*yield*/, ptk.parseQuery(tofind, opts)];
                case 1:
                    _a = _b.sent(), _a[0], postings = _a[1];
                    if (!postings.length || !ptk.inverted)
                        return [2 /*return*/, []];
                    tagname = (opts === null || opts === void 0 ? void 0 : opts.groupby) || 'ak';
                    groupby = ptk.defines[tagname];
                    tlp = [], TLP = ptk.inverted.tokenlinepos;
                    if (groupby) {
                        for (i = 0; i < groupby.linepos.length; i++) {
                            nextstart = TLP[groupby.linepos[i + 1]] || TLP[TLP.length - 1];
                            tlp.push([TLP[groupby.linepos[i]], nextstart]);
                        }
                        res = new Array(tlp.length);
                        res.fill(0);
                        for (i = 0; i < postings.length; i++) {
                            res1 = plCount(postings[i], tlp);
                            for (j = 0; j < tlp.length; j++) {
                                res[j] += res1[j];
                            }
                        }
                        out = res.map(function (count, idx) {
                            var id = groupby.fields.id.values[idx];
                            return { count: count, caption: groupby.getInnertext(idx),
                                scope: tagname + (parseInt(id) ? id : '#' + id) };
                        });
                        return [2 /*return*/, out];
                    }
                    else { //no group, as a whole
                        return [2 /*return*/, [{ count: postings.length, caption: '-', name: '-' }]];
                    }
            }
        });
    });
}
var validateTofind = function (str) {
    return (str || '').replace(/[\[\]&%$#@\/\^]/g, '').trim();
};
function hitsOfLine(line, allpostings) {
    var tlp = this.inverted.tokenlinepos;
    var hits = [];
    var _loop_1 = function (i) {
        var from = tlp[line - 1], till = tlp[line];
        var hit = plTrim(allpostings[i], from, till).map(function (it) { return it - from; });
        hits.push(hit);
    };
    for (var i = 0; i < allpostings.length; i++) {
        _loop_1(i);
    }
    return hits;
}
var tofindInSentence = function (sentence, pos, len) {
    if (pos === void 0) { pos = 0; }
    if (len === void 0) { len = 0; }
    if (pos == -1) {
        return [sentence];
    }
    var tofinds = Array();
    if (len > 0) {
        return [sentence.slice(pos, pos + len)];
    }
    if (sentence.length < 4)
        tofinds.push(sentence);
    for (var i = pos; i <= sentence.length; i++) {
        var t = sentence.slice(pos, i);
        if (t.length > 1)
            tofinds.push(t.trim());
        t = sentence.slice(pos - 1, i);
        if (t.length > 1)
            tofinds.push(t.trim());
        t = sentence.slice(pos + 1, i);
        if (t.length > 1)
            tofinds.push(t.trim());
        if (t.length > 5)
            continue;
    }
    return unique(tofinds);
};
var statSentencePhrase = function (tofinds, postings) {
    var out = {};
    if (tofinds.length == 0) {
        return [];
    }
    else if (tofinds.length == 1) {
        return [[tofinds[0], postings[0]]];
    }
    var total = postings.reduce(function (p, n, i) { return p + Math.log(tofinds[i].length * n.length); }, 0);
    var avg = total / postings.length;
    for (var i = 0; i < postings.length; i++) {
        if (Math.log(postings[i].length * tofinds[i].length) > avg && postings[i].length > 1) {
            out[tofinds[i]] = postings[i];
        }
    }
    if (!Object.keys(out).length) {
        for (var i = 0; i < postings.length; i++) {
            out[tofinds[i]] = postings[i];
        }
    }
    //dedup 諸比  諸比丘, 衛國  , 舍衛國
    for (var key in out) {
        for (var shortkey in out) {
            if (key == shortkey || !out[shortkey].length)
                continue;
            if ((key.startsWith(shortkey) || key.endsWith(shortkey)) &&
                out[key].length * 1.1 >= out[shortkey].length) {
                out[shortkey] = [];
            }
        }
    }
    for (var key in out) {
        if (out[key].length == 0)
            delete out[key];
    }
    return sortObj(out, function (a, b) { return b[1].length - a[1].length; }).slice(0, 3);
};
function searchSentence(sentence_1) {
    return __awaiter(this, arguments, void 0, function (sentence, pos, len) {
        var out, tofinds, i, tf, _a, _b;
        if (pos === void 0) { pos = 0; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    out = [];
                    tofinds = tofindInSentence(sentence.trim(), pos);
                    i = 0;
                    _c.label = 1;
                case 1:
                    if (!(i < tofinds.length)) return [3 /*break*/, 4];
                    tf = tofinds[i];
                    _b = (_a = out).push;
                    return [4 /*yield*/, phraseQuery.call(this, tf)];
                case 2:
                    _b.apply(_a, [_c.sent()]);
                    _c.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, statSentencePhrase(tofinds, out)];
            }
        });
    });
}
function searchSentenceSync(sentence, pos, len) {
    var _this = this;
    if (pos === void 0) { pos = 0; }
    if (len === void 0) { len = 0; }
    if (!sentence.trim())
        return [];
    var tofinds = tofindInSentence(sentence, pos, len);
    var out = tofinds.map(function (it) { return phraseQuerySync.call(_this, it); });
    return statSentencePhrase(tofinds, out);
}

var RenderUnit = /** @class */ (function () {
    function RenderUnit(token, ntoken, offtext, postingoffset) {
        this.token = token;
        this.postingoffset = postingoffset; //relative offset of posting (indexable token)
        this.choff = token.choff; //for sorting
        this.text = token.text; //perform text transformation here
        this.ntoken = ntoken; //base on a concrete token
        this.offtext = offtext; //the offtext object
        this.tags = []; //tags covering this token
        this.hide = false;
        this.luminate = 0; //highlight luminates surrounding token, for abridge
        this.highlight = false;
        this.css = '';
    }
    RenderUnit.prototype.tagsOf = function (closing) {
        if (closing === void 0) { closing = false; }
        var out = [];
        if (!this.tags || !this.tags.length)
            return '';
        for (var i = 0; i < this.tags.length; i++) {
            var tag = this.offtext.getTag(this.tags[i]);
            if (this.choff == tag.choff + (closing ? tag.width - 1 : 0)) {
                out.push(this.tags[i]);
            }
        }
        return out;
    };
    RenderUnit.prototype.closestTag = function () {
        return this.offtext.getTag(this.tags[this.tags.length - 1]);
    };
    return RenderUnit;
}());
var findUnitText = function (runits, text, from) {
    if (from === void 0) { from = 0; }
    for (var i = from; i < runits.length; i++) {
        if (runits[i].token.text === text)
            return runits[i];
    }
};
var getRenderUnitClasses = function (ru, prepend, append) {
    if (prepend === void 0) { prepend = ''; }
    if (append === void 0) { append = ''; }
    var css = [];
    css.push(prepend);
    var ot = ru.offtext;
    for (var j = 0; j < ru.tags.length; j++) {
        var tag = ot.tags[ru.tags[j]];
        css.push(tag.name);
        if (tag.active)
            css.push(tag.name + '_active');
        var hasbracket = closeBracketOf(ru.offtext.tagRawText(tag)) ? 1 : 0;
        if (ru.choff == tag.choff + hasbracket)
            css.push(tag.name + '_start');
        if (ru.choff == tag.choff + tag.width - 1 - hasbracket)
            css.push(tag.name + '_end');
    }
    if (ru.highlight)
        css.push('highlight');
    css.push(append);
    ru.hide && css.push('hide');
    return css.join(' ');
};
var renderOfftext = function (linetext, opts) {
    if (linetext === void 0) { linetext = ''; }
    if (opts === void 0) { opts = {}; }
    var extra = opts.extra || [];
    var hits = opts.hits || [];
    var phraselength = opts.phraselength || [];
    // const [plain,tags]=parseOfftext(linetext);
    var ot = new Offtext(linetext, opts.line || 0);
    var postingoffset = 0;
    var runits = tokenize$1(ot.plain).map(function (tk, idx) {
        postingoffset++; //unsearchable token also increase posting offset
        var ru = new RenderUnit(tk, idx, ot, postingoffset);
        return ru;
    });
    var tagsAt = []; //tags at plain position
    var phit = 0, pextra = 0;
    for (var i = 0; i < ot.tags.length; i++) {
        var tag = ot.tags[i];
        // j<tag.choff+tag.width 的話， 零字長 class 無法作用
        // 整行標記之後 應有一半行空格，就不會塗到第一個字
        var width = tag.width ? tag.width : 1;
        for (var j = tag.choff; j < tag.choff + width; j++) {
            if (!tagsAt[j])
                tagsAt[j] = [];
            tagsAt[j].push(i);
        }
    }
    for (var i = 0; i < runits.length; i++) {
        var ru = runits[i];
        ru.tags = tagsAt[ru.token.choff] || [];
        if (extra.length && pextra < extra.length) {
            if (ru.choff == extra[pextra].choff) {
                // const tlen=extra[pextra].text.length;
                ru.extra = extra[pextra];
                pextra++;
            }
        }
        if (hits && hits.length && phit < hits.length) {
            if (ru.postingoffset >= hits[phit] && ru.postingoffset < hits[phit] + phraselength[phit]
                && ru.token.type >= exports.TokenType.SEARCHABLE) {
                ru.highlight = true;
            }
            if (hits[phit] + phraselength[phit] <= ru.postingoffset)
                phit++;
            if (ru.highlight) {
                ru.luminate++;
                var j = i + 1;
                while (j < runits.length) {
                    if (runits[j].token.type >= exports.TokenType.SEARCHABLE || j - i < MIN_ABRIDGE)
                        j++;
                    else
                        break;
                    if (j < runits.length)
                        runits[j].luminate++;
                }
                j = i - 1;
                while (j > 0) {
                    if (runits[j].token.type >= exports.TokenType.SEARCHABLE || i - j < MIN_ABRIDGE)
                        j--;
                    else
                        break;
                    if (j >= 0)
                        runits[j].luminate++;
                }
            }
        }
        var bracket = closeBracketOf(ru.text);
        if (ru.hide || (ru.tags.length && bracket)) {
            ru.hide = true;
            var closeAt = findUnitText(runits, bracket, i + 1);
            if (closeAt)
                closeAt.hide = true;
        }
    }
    return [runits, ot];
};
var abridgeRenderUnits = function (runits, minwidth) {
    if (minwidth === void 0) { minwidth = 10; }
    var out = [];
    var abridged = [];
    var addAbridge = function (final) {
        if (final === void 0) { final = false; }
        if (abridged.length > MIN_ABRIDGE) {
            out.push([abridged.length, abridged[0], final]);
        }
        else {
            for (var j = 0; j < abridged.length; j++) {
                out.push(runits[abridged[j]]);
            }
        }
        abridged = [];
    };
    if (runits.length < minwidth)
        return runits;
    for (var i = 0; i < runits.length; i++) {
        var ru = runits[i];
        if (ru.luminate) {
            addAbridge();
            out.push(ru);
        }
        else {
            abridged.push(i);
        }
    }
    addAbridge(true);
    return out;
};

var m$1 = (typeof navigator !== 'undefined') && navigator.userAgent.match(/Chrome\/(\d+)/);
var supprtedBrowser = m$1 && parseInt(m$1[1]) >= 86;
var createBrowserDownload = function (filename, buf) {
    var file = new Blob([buf], { type: "application/octet-binary" });
    var a = document.createElement("a"), url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
};
function verifyPermission(fileHandle_1) {
    return __awaiter(this, arguments, void 0, function (fileHandle, readWrite) {
        var options;
        if (readWrite === void 0) { readWrite = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    options = {};
                    if (readWrite) {
                        options.mode = 'readwrite';
                    }
                    return [4 /*yield*/, fileHandle.queryPermission(options)];
                case 1:
                    // Check if permission was already granted. If so, return true.
                    if ((_a.sent()) === 'granted') {
                        return [2 /*return*/, true];
                    }
                    return [4 /*yield*/, fileHandle.requestPermission(options)];
                case 2:
                    // Request permission. If the user grants permission, return true.
                    if ((_a.sent()) === 'granted') {
                        return [2 /*return*/, true];
                    }
                    // The user didn't grant permission, so return false.
                    return [2 /*return*/, false];
            }
        });
    });
}
var openSourceOption = {
    id: 'inputfile',
    startIn: 'desktop',
    multiple: true,
    types: [
        {
            description: 'Source Files',
            accept: {
                'text/plain': ['.off', '.txt', '.tsv', '.css', '.xml']
            }
        }
    ]
};
var savePtkOption = {
    id: 'ptkfile',
    startIn: 'desktop',
    types: [
        {
            description: 'Ptk File',
            accept: {
                'application/zip': ['.ptk'],
            }
        }
    ]
};
var openPtkOption = {
    id: 'ptkfile',
    startIn: 'desktop',
    types: [
        {
            description: 'Ptk File',
            accept: {
                'application/zip': ['.ptk'],
            }
        }
    ]
};
var openComOption = {
    id: 'comfile',
    startIn: 'desktop',
    types: [
        {
            description: 'Com File',
            accept: {
                'application/zip': ['.com'],
            }
        }
    ]
};
var saveComOption = {
    id: 'comfile',
    startIn: 'desktop',
    types: [
        {
            description: 'Com File',
            accept: {
                'application/zip': ['.com'],
            }
        }
    ]
};
var saveSourceOption = {
    id: 'savesource',
    startIn: 'desktop',
    types: [
        {
            description: 'Source Files',
            accept: {
                'text/plain': ['.off', '.txt']
            }
        }
    ]
};

/* browser is save to include this file, used by meta*/
var hasWildcard = function (s) {
    return s.indexOf('?') > -1 || s.indexOf('[') > -1 || s.indexOf('*') > -1 || s.indexOf('$') > -1 || s.indexOf('{') > -1;
};
var expandWildcard = function (folder, pat, isDir) {
    var files = [];
    if (hasWildcard(pat)) {
        var folderfiles = fs.readdirSync(folder);
        files = glob(folderfiles, pat);
    }
    else if (fs.existsSync(folder + pat)) {
        files = [pat];
    }
    if (isDir)
        files = files.filter(function (fn) { return fs.statSync(folder + fn).isDirectory(); });
    return files;
};
var glob = function (files, filepat) {
    if (typeof files == 'string') {
        files = fs.readdirSync(files);
    }
    var start, end;
    if (!filepat)
        return files;
    var m = filepat.match(/\{(\d+)\-(\d+)\}/);
    if (m) {
        start = parseInt(m[1]);
        end = parseInt(m[2]);
        filepat = filepat.replace(/\{\d+\-\d+\}/, '(\\d+)');
    }
    var pat = filepat.replace(/\*/g, '[^\\.]+').replace(/\./g, '\\.').replace(/\?/g, '.');
    var reg = new RegExp(pat);
    if (start && end) {
        return files.filter(function (f) {
            var m = f.match(reg);
            return m && (parseInt(m[1]) >= start && parseInt(m[1]) <= end);
        });
    }
    else {
        return files.filter(function (f) { return f.match(reg); });
    }
};
var filesFromPattern = function (pat, rootdir) {
    if (rootdir === void 0) { rootdir = './'; }
    var outfiles = {};
    var patterns = (typeof pat === 'string') ? pat.split(/[;,]/) : pat;
    if (rootdir && rootdir.slice(rootdir.length - 1) !== '/')
        rootdir += '/';
    patterns.forEach(function (pat) {
        var at = pat.lastIndexOf('/');
        var dir = '';
        var subfolders = [''];
        if (at > -1) {
            dir = pat.slice(0, at);
            pat = pat.slice(at + 1);
            subfolders = expandWildcard(rootdir, dir, true);
        }
        else {
            subfolders = [''];
        }
        subfolders.forEach(function (subfolder) {
            var files = expandWildcard(rootdir + subfolder, pat);
            files.forEach(function (f) {
                outfiles[(subfolder ? subfolder + '/' : '') + f] = true;
            });
        });
    });
    var out = [];
    var _loop_1 = function (fn) {
        if (fs.statSync(rootdir + fn).isDirectory()) {
            var files = fs.readdirSync(rootdir + fn).map(function (f) { return fn + (fn.endsWith('/') ? '' : '/') + f; });
            out.push.apply(out, files);
        }
        else {
            out.push(fn);
        }
    };
    for (var fn in outfiles) {
        _loop_1(fn);
    }
    return out;
};

var _pool = {};
var poolHas = function (name) { return !!_pool[name]; };
var poolGet = function (name) { return _pool[name]; };
var poolAdd = function (name, inst) { return _pool[name] = inst; };
var poolDel = function (name) { return delete _pool[name]; };
var poolGetAll = function () {
    var out = Array();
    for (var name_1 in _pool) {
        out.push(_pool[name_1]);
    }
    return out;
};
var hasLang = function (lang) {
    for (var name_2 in _pool) {
        var ptk = _pool[name_2];
        if (ptk.lang === lang)
            return true;
    }
};
var poolParallelPitakas = function (ptk) {
    var _a;
    var align = (_a = ptk.attributes) === null || _a === void 0 ? void 0 : _a.align;
    if (!align)
        align = ptk.name.replace(/\-[^-]+$/, '');
    var out = Array();
    for (var n in _pool) {
        if (_pool[n].attributes.align == align || n.replace(/\-[^-]+$/, '') == align) {
            if (ptk.name !== _pool[n].name)
                out.push(n);
        }
    }
    return out;
};

var pagefilename = function (page) { return page.toString().padStart(3, '0') + '.js'; };
var makePageURI = function (folder, page) {
    var fn = folder + '/' + pagefilename(page);
    return fn;
};
function loadNodeJs(page) {
    return __awaiter(this, void 0, void 0, function () {
        var fn, data, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fn = makePageURI(this.name, page);
                    //try sibling folder
                    if (!fs.existsSync(fn) && fs.existsSync('../' + this.name + '/' + this.name)) {
                        fn = makePageURI('../' + this.name + '/' + this.name, page);
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs.promises.readFile(fn, 'utf8')];
                case 2:
                    data = _a.sent();
                    this.setPage.apply(this, __spreadArray([page], parseJsonp(data), false));
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.error('readFile failed,', fn, e_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadRemoteZip(page) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            throw "not implement yet";
        });
    });
}
function loadInMemoryZipStore(page) {
    return __awaiter(this, void 0, void 0, function () {
        var fn, f, content;
        return __generator(this, function (_a) {
            fn = this.name + '/' + pagefilename(page);
            f = this.zipstore.find(fn);
            content = f && new TextDecoder().decode(f.content);
            content && this.setPage.apply(this, __spreadArray([page], parseJsonp(content), false));
            return [2 /*return*/];
        });
    });
}
function loadFetch(page) {
    return __awaiter(this, void 0, void 0, function () {
        var data, uri, res, text, arr;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!this.zip) return [3 /*break*/, 2];
                    return [4 /*yield*/, this.zip.readTextFile(this.name + '/' + pagefilename(page))];
                case 1:
                    data = _a.sent();
                    this.setPage.apply(this, __spreadArray([page], parseJsonp(data), false));
                    return [2 /*return*/];
                case 2:
                    uri = makePageURI(this.name, page);
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, fetch(uri)];
                case 4:
                    res = _a.sent();
                    return [4 /*yield*/, res.text()];
                case 5:
                    text = _a.sent();
                    arr = parseJsonp(text);
                    this.setPage.apply(this, __spreadArray([page], arr, false));
                    return [3 /*break*/, 7];
                case 6:
                    _a.sent();
                    this.failed = true;
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
var jsonp = function (page, header, _payload) {
    var ptk = poolGet(header.name);
    ptk.setPage(page, header, _payload);
};
function isLoaded(page) {
    return (page == 0) ? this.pagestarts.length : this._pages[page - 1];
}
function loadJSONP(page) {
    return __awaiter(this, void 0, void 0, function () {
        var tried, timer, that;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isLoaded.call(this, page))
                        return [2 /*return*/];
                    if (!typeof window.jsonp !== 'function') {
                        window.jsonp = jsonp;
                    }
                    tried = 0;
                    that = this;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, loadScript(makePageURI(that.name, page), function () {
                            if (isLoaded.call(that, page))
                                return true;
                            //wait for jsonp() to setPage
                            timer = setInterval(function () {
                                tried++;
                                if (tried > 10 || isLoaded.call(that, page)) {
                                    if (tried > 10)
                                        console.error('failed loading page', page, that.name);
                                    clearInterval(timer);
                                }
                            }, 10);
                        })];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a.sent();
                    this.failed = true;
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}

var instancecount = 0;
var combineRange = function (range) {
    var combined = Array();
    var from = 0;
    range = range.filter(function (it) { return !!it; });
    if (Array.isArray(range[0]) && range.length) {
        range.sort(function (a, b) { return a - b; });
        from = range[0][0];
        for (var i = 1; i < range.length; i++) {
            if (range[i][0] > range[i - 1][1]) {
                combined.push([from, range[i - 1][1]]);
                from = range[i][0];
            }
        }
        if (range[range.length - 1][1] > from)
            combined.push([from, range[range.length - 1][1]]);
    }
    else {
        return range;
    }
    return combined;
};
var LineBase = /** @class */ (function () {
    function LineBase(opts) {
        var _this = this;
        this.pageOfLine = function (line) {
            if (line >= _this.pagestarts[_this.pagestarts.length - 1])
                return _this.pagestarts.length - 1;
            return bsearchNumber(_this.pagestarts, line);
        };
        this.stamp = ++instancecount;
        this._pages = []; // read time,   line not split
        this._lineoffsets = []; // lineoffsets of each page
        this.pagestarts = [];
        this.header = { starts: Array(),
            sectionnames: Array(),
            sectionstarts: Array(),
            sectiontypes: Array(),
            preload: Array(),
            name: '' };
        this.name = opts.name || '';
        this.zip = opts.zip;
        this.zipstore = opts.zipstore;
        this.payload; //payload in 000.js
        var protocol = typeof chrome !== 'undefined' ? 'chrome-extension:' : '';
        //this._loader=()=>{};
        if (typeof window !== 'undefined') {
            protocol = window.location.protocol;
        }
        if (this.zipstore) { //in memory zip
            this._loader = loadInMemoryZipStore;
        }
        else if (protocol === 'http:' || protocol === 'https:' || protocol === 'chrome-extension:') {
            this._loader = loadFetch;
        }
        else if (protocol == 'file:') {
            this._loader = loadJSONP;
        }
        else {
            this._loader = this.zip ? loadRemoteZip : loadNodeJs;
        }
        this.failed = false;
        if (opts.contentString) {
            var _a = extractObject(opts.contentString), headerstr = _a[0], len = _a[1];
            var header = JSON.parse(headerstr);
            var lines = opts.contentString.slice(len).split('\n');
            var payload = (lines.shift() || '').replace(/\\n/g, '\n');
            this.setPage(0, header, payload);
            for (var i = 0; i < header.starts.length; i++) {
                var pagedata = lines.slice((i > 0 ? header.starts[i - 1] : 0), header.starts[i]);
                this.setPage(i + 1, {}, pagedata.join('\n'));
            }
            this.inmemory = true;
        }
        else if (!opts.inmemory) {
            this._loader.call(this, 0);
        }
    }
    LineBase.prototype.loadAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadLines([[0, this.pagestarts[this.pagestarts.length - 1]]])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.slice(0, this.pagestarts[this.pagestarts.length - 1])];
                }
            });
        });
    };
    LineBase.prototype.inMem = function () {
        return this.inmemory || this.zipstore;
    };
    LineBase.prototype.pageOfRange = function (_a) {
        var from = _a[0], to = _a[1];
        if (from < 0)
            return [];
        if (from > to)
            to += from;
        var cstart = this.pageOfLine(from);
        var cend = this.pageOfLine(to);
        var notloaded = Array();
        if (cstart > 1)
            cstart--; //fetch previous page
        for (var i = cstart; i < cend + 1; i++) {
            if (!this._pages[i])
                notloaded.push(i);
        }
        return notloaded;
    };
    LineBase.prototype.loadLines = function (_range) {
        return __awaiter(this, void 0, void 0, function () {
            var that, toload, range, notincache, i, _a, from, to, jobs, i;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        that = this;
                        toload = Array(), range = combineRange(_range);
                        notincache = {};
                        for (i = 0; i < range.length; i++) {
                            if (Array.isArray(range[i])) {
                                _a = range[i], from = _a[0], to = _a[1];
                                toload.push.apply(toload, this.pageOfRange([from, to]));
                            }
                            else {
                                notincache[this.pageOfLine(range[i])] = true;
                            }
                        }
                        toload.push.apply(toload, Object.keys(notincache).map(function (it) { return parseInt(it); }));
                        toload = unique(toload.filter(function (it) { return !that._pages[it]; }));
                        jobs = Array();
                        for (i = 0; i < toload.length; i++) {
                            jobs.push(this._loader.call(this, toload[i] + 1));
                        }
                        return [4 /*yield*/, Promise.all(jobs)];
                    case 1:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LineBase.prototype.lineCount = function () {
        return this.header.starts[this.header.starts.length - 1];
    };
    LineBase.prototype.getPageLineOffset = function (page, line) {
        if (page > this._pages.length)
            return 0;
        if (line == 0)
            return 0;
        if (line > this._lineoffsets[page].length)
            return this._pages[page].length;
        return this._lineoffsets[page][line - 1];
    };
    LineBase.prototype.getLines = function (nlines) {
        if (!nlines.length)
            return [];
        var out = Array();
        var pline = nlines[0];
        var start = pline;
        for (var i = 1; i < nlines.length; i++) {
            if (pline + 1 !== nlines[i]) {
                out = out.concat(this.slice(start, i));
                start = nlines[i];
            }
            pline = nlines[i];
        }
        out = out.concat(this.slice(start, pline + 1));
        return out;
    };
    LineBase.prototype.getLine = function (nline) {
        return this.slice(nline, nline + 1)[0];
    };
    LineBase.prototype.slice = function (nline, to) {
        if (!to)
            to = nline + 1;
        var p1 = this.pageOfLine(nline);
        var p2 = this.pageOfLine(to);
        var out = '';
        for (var i = p1; i <= p2; i++) {
            if (!this._pages[i])
                return out.split('\n'); //page not loaded yet
            if (i == p1 || i == p2) { // first or last part
                var slicefrom = this.getPageLineOffset(i, nline - (p1 > 0 ? this.pagestarts[p1 - 1] : 0));
                if (nline)
                    slicefrom++; //skip the \n for first line
                var sliceto = this.getPageLineOffset(i, to - (p2 > 0 ? this.pagestarts[p2 - 1] : 0));
                if (p2 > p1) {
                    var append = this._pages[i].slice(0, sliceto);
                    if (i == p1)
                        out = this._pages[i].slice(slicefrom); //+1 skip the \n
                    else
                        out += (out && append ? '\n' : '') + append; //add extra \n if append is not null
                    //do not allow empty line become the first line
                }
                else { //same block
                    out += this._pages[i].slice(slicefrom, sliceto);
                }
                //} else out+='\n'+this._pages[i];//middle , 2024/9/16 excessive \n for loading tag section
            }
            else
                out += (out.length ? '\n' : '') + this._pages[i]; //dirty workaround
        }
        return out.split('\n');
    };
    LineBase.prototype.setPage = function (page, header, payload) {
        if (page == 0) {
            this.header = header;
            this.name = this.header.name;
            this.pagestarts = header.starts;
            this.payload = payload || 'nopayload';
            this.opened = true;
        }
        else if (page > 0) {
            this._pages[page - 1] = payload;
            this._lineoffsets[page - 1] = lineBreaksOffset(payload);
        }
    };
    LineBase.prototype.isReady = function () {
        if (this.payload)
            return true;
        var that = this;
        var timer;
        return new Promise(function (resolve) {
            timer = setInterval(function () {
                if (that.failed)
                    resolve(false); //set by loadScript, loadFetch
                else if (that.payload) {
                    clearInterval(timer);
                    resolve(true);
                }
            }, 50);
        });
    };
    LineBase.prototype.getSection = function (name) {
        var _a = this.sectionRange(name), from = _a[0], to = _a[1];
        if (from == to)
            return [];
        return this.slice(from, to);
    };
    LineBase.prototype.sectionRange = function (sname) {
        var _a = this.header, sectionnames = _a.sectionnames, sectionstarts = _a.sectionstarts;
        if (!sectionnames || !sectionnames.length)
            return [0, 0];
        for (var i = 0; i < sectionnames.length; i++) {
            var name_1 = sectionnames[i];
            if ((sname && name_1 == sname)) {
                var endoflastsection = i < sectionstarts.length - 1
                    ? sectionstarts[i + 1] : this.pagestarts[this.pagestarts.length - 1];
                return [sectionstarts[i], endoflastsection];
            }
        }
        return [0, 0];
    };
    return LineBase;
}());

var makePageJsonp = function (name, page, start, payload) {
    return 'jsonp(' + page + ',{"name":"' + name + '","start":' + start + '},`' + payload + '`)';
};
var makeHeader = function (name, header, pagestarts) {
    var meta = Object.assign({}, header, { name: name, starts: pagestarts, buildtime: new Date() });
    return JSON.stringify(meta);
};
var LineBaser = /** @class */ (function () {
    function LineBaser(opts) {
        if (opts === void 0) { opts = {}; }
        this._data = []; // write time, line splited
        this._accsize = 0;
        this.pagesize = opts.pagesize || 1024 * 64;
        this.pagestarts = [];
        this.payload = '';
        this.sealed = false;
        this.header = { starts: [], sectionnames: [], sectionstarts: [], sectiontypes: [], preload: [],
            fulltext: [], fulltextcaption: [], eot: 0 };
        this.name = opts.name || '';
        this.zip = opts.zip;
    }
    LineBaser.prototype.setName = function (name) {
        this.name = name;
    };
    LineBaser.prototype.asString = function (escape) {
        if (escape === void 0) { escape = false; }
        var header = makeHeader(this.name, this.header || {}, this.pagestarts);
        var text = escape ? escapeTemplateString(this._data.join('\n')) : this._data.join('\n');
        //payload right after header json object, a single string
        return header + this.payload.replace(/\n/g, '\\n') + '\n' + text;
    };
    LineBaser.prototype.dumpJs = function (cb) {
        if (!this.name) {
            throw "need a name before dumping";
        }
        this.newPage(); //finalize last page;
        var start = 0;
        var jsonpfn = pagejsonpfn(0);
        var headerstring = 'jsonp(0,' + makeHeader(this.name, this.header || {}, this.pagestarts) + ',`' + escapeTemplateString(this.payload) + '`';
        cb(jsonpfn, headerstring, 0);
        for (var i = 0; i < this.pagestarts.length; i++) {
            var lines = this._data.slice(start, this.pagestarts[i]);
            var towrite = makePageJsonp(this.name, i + 1, start, escapeTemplateString(lines.join('\n')));
            var done = cb(pagejsonpfn(i + 1), towrite, i + 1);
            if (done)
                break;
            start = this.pagestarts[i];
        }
        this._data = [];
        this._accsize = 0;
        this.pagestarts = [];
    };
    LineBaser.prototype.newPage = function () {
        this.pagestarts.push(this._data.length);
        this._accsize = 0;
    };
    LineBaser.prototype.addLine = function (line, samepage) {
        if (samepage === void 0) { samepage = false; }
        if (this.sealed)
            throw ('sealed');
        this._data.push(line);
        this._accsize += line.length;
        if (this._accsize > this.pagesize && !samepage)
            this.newPage();
    };
    LineBaser.prototype.addSection = function (name, type) {
        if (!name)
            name = (this.header.sectionnames.length + 1).toString();
        if (!this.header.sectionnames) {
            this.header.sectionnames = [];
            this.header.sectionstarts = [];
            this.header.sectiontypes = [];
        }
        this.header.sectionnames.push(name);
        this.header.sectionstarts.push(this._data.length);
        if (name.startsWith("_") && !type)
            type = name.slice(1); // _tokens, _postings, and _toc
        this.header.sectiontypes.push(type);
    };
    LineBaser.prototype.append = function (buffer, opts) {
        if (opts === void 0) { opts = {}; }
        var name = opts.name || '';
        var newpage = opts.newpage; // start a new page
        var samepage = opts.samepage; // save in same page , no matter how big it is
        var type = opts.sourcetype || opts.type;
        if ((buffer.length + this._accsize > this.pagesize || newpage) && this._data.length) {
            this.newPage(); //start a new page for big buffer.
        }
        if (name)
            this.addSection(name, type);
        var lines = Array.isArray(buffer) ? buffer : buffer.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            if (this.onAddLine) {
                var text = this.onAddLine(lines[i], i, name);
                if (typeof text === 'string')
                    this.addLine(text, samepage);
            }
            else {
                this.addLine(lines[i] || '', samepage);
            }
        }
    };
    return LineBaser;
}());

var _a$1;
var MAX_VERROR = 3;
exports.VError = void 0;
(function (VError) {
    VError["NoKeys"] = "NO_KEYS";
    VError["NoKey"] = "NO_KEY";
    VError["NotANumber"] = "NOT_NUMBER";
    VError["Empty"] = "EMPTY_BUFFER";
    VError["Pattern"] = "PATTERN_MISMATCH";
    VError["NotUnique"] = "NOT_UNIQUE";
    VError["Mandatory"] = "MANDANTORY";
    VError["TypeRedef"] = "TYPE_REDEF";
    VError["MissingTagName"] = "MISSING_TAGNAME";
    VError["UnknownType"] = "UNKNOWN_TYPE";
    VError["ExcessiveField"] = "EXCESSIVE_FIELD";
    VError["PtkNamed"] = "PTK_NAMED";
    VError["PtkNoName"] = "PTK_NONAME";
    VError["RedefineChunkTag"] = "REDEFINE_CHUNK_CHUNK_TAG";
    VError["InvalidLinkAddress"] = "INVALID_LINK_ADDRESS";
})(exports.VError || (exports.VError = {}));
var VErrorMessage = (_a$1 = {},
    _a$1[exports.VError.NoKeys] = 'missing keys $1',
    _a$1[exports.VError.NoKey] = 'missing key $1 for string',
    _a$1[exports.VError.NotANumber] = 'not a number',
    _a$1[exports.VError.Pattern] = 'pattern mismatch',
    _a$1[exports.VError.NotUnique] = 'not unique',
    _a$1[exports.VError.Mandatory] = 'mandatory field',
    _a$1[exports.VError.TypeRedef] = 'redefine type',
    _a$1[exports.VError.MissingTypedef] = 'mssing typedef',
    _a$1[exports.VError.ExcessiveField] = 'excessive field',
    _a$1[exports.VError.UnknownType] = 'unknown type',
    _a$1[exports.VError.PtkNamed] = 'ptk already named',
    _a$1[exports.VError.PtkNoName] = 'ptk not named',
    _a$1[exports.VError.Empty] = 'Empty buffer',
    _a$1);
var errorMessage = function (code, arg) {
    return (VErrorMessage[code] || '').replace('$1', arg || '');
};

var Field = /** @class */ (function () {
    function Field(name, def) {
        this.name = name;
        this.foreign = def.foreign || '';
        this.pattern = def.pattern || null; //regex pattern
        this.keys = def.keys || [];
        this.unique = null;
        this.optional = true;
        this.caption = '';
        this.type = def.type || 'string';
        this.values = []; //number or string value, runtime only
        this.sortedIndex;
        for (var n in def) {
            if (!this.hasOwnProperty(n)) {
                console.log('unknown defining attr', n, 'of', name, def);
            }
            this[n] = def[n];
        }
        if (def.unique)
            this.unique = {};
    }
    Field.prototype.resetUnique = function () {
        if (this.unique)
            this.unique = {};
    };
    Field.prototype.validate = function (value, line) {
        if (this.unique) {
            if (this.unique[value]) { //found in this line, cannot be zero
                return [exports.VError.NotUnique, 'tag:' + this.name + ', value:' + value, this.unique[value]]; //send ref line
            }
            else {
                this.unique[value] = line; //first occurance
            }
        }
        return [0, value];
    };
    Field.prototype.find = function () {
        return -1;
    };
    return Field;
}());

var ACTIONPAGESIZE = 5;
var MAXDIVISIONLINE = 30;

var BRANCH_SEP = '.';
var parseAction = function (action, objform) {
    if (objform === void 0) { objform = false; }
    if (!action)
        return [];
    var branches = action.split(BRANCH_SEP);
    var out = Array();
    for (var i = 0; i < branches.length; i++) {
        var m1 = branches[i].match(/^([a-z_\-]+)#([a-z\d_-]+)$/); // with # id
        var m2 = branches[i].match(/^([a-z_\-]+)(\d+[a-z\d_-]+)$/); // with number prefix mix id
        var m3 = branches[i].match(/^([a-z_\-]+)(\d*)$/); // with pure number id
        if (m1) {
            out.push([m1[1], m1[2]]);
        }
        else if (m2) {
            out.push([m2[1], m2[2]]);
        }
        else if (m3) {
            out.push([m3[1], m3[2]]);
        }
        else {
            var at = branches[i].indexOf('#');
            if (at > 0) {
                out.push([branches[i].slice(0, at), branches[i].slice(at + 1)]);
            }
            else {
                out.push(['ck', branches[i]]); //default			
            }
        }
    }
    if (objform) {
        var obj = {};
        for (var i = 0; i < out.length; i++) {
            var _a = out[i], tag = _a[0], value = _a[1];
            obj[tag] = value;
        }
        return obj;
    }
    else {
        return out;
    }
};
var sameAddress = function (addr1, addr2) {
    if (typeof addr1 == 'string')
        addr1 = parseAddress(addr1);
    if (typeof addr2 == 'string')
        addr2 = parseAddress(addr2);
    if (!addr1 || !addr2)
        return;
    return addr1.action == addr2.action && addr1.ptkname == addr2.ptkname;
};
var makeAddress = function (ptkname, action, from, till, lineoff, choff) {
    if (ptkname === void 0) { ptkname = ''; }
    if (action === void 0) { action = ''; }
    if (from === void 0) { from = 0; }
    if (till === void 0) { till = 0; }
    if (lineoff === void 0) { lineoff = 0; }
    if (choff === void 0) { choff = 0; }
    if (typeof (ptkname) == 'object') {
        var obj = ptkname;
        ptkname = obj.ptkname;
        action = obj.action || '';
        from = obj.from || 0;
        till = obj.till || 0;
        lineoff = obj.highlightline || obj.lineoff || 0;
        choff = obj.choff || 0;
    }
    var linechoff = '';
    if (choff > 0) {
        linechoff = lineoff + '-' + choff;
    }
    else if (lineoff > 0) {
        linechoff = lineoff.toString();
    }
    return (ptkname ? ptkname + ':' : '') + action + (from ? '>' + from : '') + (till ? '<' + till : '') + (linechoff ? ':' + linechoff : '');
};
var parseAddress = function (address) {
    var ptkname = '', action = '', from = '', till = '', linechoff = ''; //left bound and right bound
    var m = address.match(PTK_ACTION_FROMTILL);
    if (m) {
        m[0], ptkname = m[1], action = m[2], from = m[3], till = m[4], linechoff = m[5];
    }
    else {
        m = address.match(PTK_FROMTILL);
        if (m) {
            m[0], ptkname = m[1], from = m[2], till = m[3], linechoff = m[4];
        }
        else {
            m = address.match(FROMTILL);
            if (m)
                m[0], from = m[1], till = m[2], linechoff = m[3];
            else
                return null;
        }
    }
    from = (from || '').slice(1);
    till = (till || '').slice(1);
    linechoff = (linechoff || '').slice(1);
    if (!from && !till && linechoff) {
        if (parseInt(linechoff) > ACTIONPAGESIZE) {
            from = parseInt(linechoff) - Math.floor(ACTIONPAGESIZE / 2);
            till = from + ACTIONPAGESIZE;
        }
    }
    var choff = 0;
    var at = linechoff.indexOf('-');
    if (~at)
        choff = parseInt(linechoff.slice(at + 1));
    ptkname = ptkname || '';
    ptkname = ptkname.slice(0, ptkname.length - 1); //remove :
    return { ptkname: ptkname, action: action, from: Math.abs(parseInt(from)) || 0, till: Math.abs(parseInt(till)) || 0,
        highlightline: linechoff ? parseInt(linechoff) : -1,
        lineoff: parseInt(linechoff), choff: choff
    };
};
function rangeOfElementId(eleidarr) {
    var _a, _b, _c, _d, _e, _f, _g;
    var out = Array(), ptk = this;
    var from = 0, to = ptk.header.eot;
    for (var i = 0; i < eleidarr.length; i++) {
        var _h = eleidarr[i], ele = _h[0], id = _h[1];
        if (ptk.defines[ele]) {
            var idtype = (_a = ptk.defines[ele]) === null || _a === void 0 ? void 0 : _a.fields.id;
            var _id = ((idtype === null || idtype === void 0 ? void 0 : idtype.type) == 'number') ? parseInt(id) : id;
            var startfrom = bsearchNumber(ptk.defines[ele].linepos, from);
            var at = idtype.values.indexOf(_id, startfrom);
            var first = ptk.defines[ele].linepos[at] || ptk.defines[ele].linepos[0];
            var last = ptk.defines[ele].linepos[at + 1] || ptk.header.eot;
            if (first >= from && idtype.values[at] == _id) {
                from = first;
                if (last > to && to !== ptk.header.eot)
                    last = to; //trim it
                else
                    to = last;
                out.push([first, last]);
            }
            else {
                return [];
                //out.push([0,0]);
            }
        }
        else {
            //try book id first, then artbulk id
            var at = (_b = ptk.defines.bk) === null || _b === void 0 ? void 0 : _b.fields.id.values.indexOf(ele);
            var at2 = at == -1 ? (_c = ptk.defines.ak) === null || _c === void 0 ? void 0 : _c.fields.id.values.indexOf(ele) : -1;
            if (i == 0 && (~at || ~at2)) {
                var first = ((_d = ptk.defines.bk) === null || _d === void 0 ? void 0 : _d.linepos[at]) || ((_e = ptk.defines.ak) === null || _e === void 0 ? void 0 : _e.linepos[at2]);
                var last = ((_f = ptk.defines.bk) === null || _f === void 0 ? void 0 : _f.linepos[at + 1]) || ((_g = ptk.defines.ak) === null || _g === void 0 ? void 0 : _g.linepos[at2 + 1]);
                if (!last)
                    last = ptk.header.eot;
                out.push([first, last]);
                from = first;
            }
        }
    }
    //for multple tag range, last should not cross section boundary
    //workaround for ak range
    if (eleidarr.length > 1) {
        var sstarts = ptk.header.sectionstarts;
        for (var i = 0; i < out.length; i++) {
            var _j = out[i], first = _j[0], last = _j[1];
            var at = bsearchNumber(sstarts, first + 1);
            if (last > sstarts[at]) {
                out[i][1] = sstarts[at];
            }
        }
    }
    return out;
}
function rangeOfAddress(address) {
    var addr = address;
    if (typeof address == 'string') {
        addr = parseAddress(address);
    }
    var from = addr.from, till = addr.till, action = addr.action, highlightline = addr.highlightline;
    var eleid = parseAction(action);
    var ranges = rangeOfElementId.call(this, eleid);
    if (ranges.length) {
        var _a = ranges[ranges.length - 1], first = _a[0], last = _a[1];
        return [first, last, from, till, highlightline];
    }
    else {
        return [0, 0, from, till, highlightline]; //不存在
        //數字型不知道終點，預設取一行
    }
}
function fetchAddress(address) {
    return __awaiter(this, void 0, Arrary, function () {
        var r, lines;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    r = rangeOfAddress.call(this, address);
                    if (!r || r[0] == r[1])
                        return [2 /*return*/, []];
                    return [4 /*yield*/, this.loadLines([r])];
                case 1:
                    _a.sent();
                    lines = this.slice(r[0], r[1]);
                    return [2 /*return*/, lines];
            }
        });
    });
}
//for grammar code
function fetchAddressExtra(address_1) {
    return __awaiter(this, arguments, void 0, function (address, ext) {
        var r, sectionname, parsectionname, start, parstart, r0, r1, lines;
        if (ext === void 0) { ext = 'num'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    r = rangeOfAddress.call(this, address);
                    if (!r || r[0] == r[1])
                        return [2 /*return*/, []];
                    sectionname = this.getSectionName(r[0]);
                    parsectionname = sectionname.replace('off', ext);
                    start = this.getSectionStart(sectionname);
                    parstart = this.getSectionStart(parsectionname);
                    if (!~parstart) return [3 /*break*/, 2];
                    r0 = r[0] - start + parstart;
                    r1 = r[1] - start + parstart;
                    return [4 /*yield*/, this.loadLines([r0, r1])];
                case 1:
                    _a.sent();
                    lines = this.slice(r0, r1);
                    if (ext == 'num') {
                        lines = lines.map(function (it) { return unpackInt(it); });
                    }
                    return [2 /*return*/, lines];
                case 2: return [2 /*return*/, []];
            }
        });
    });
}
//only display the first level
function innertext(address) {
    var _a, _b;
    var addr = address;
    if (typeof address == 'string') {
        addr = parseAddress(address);
    }
    var action = addr.action;
    var defines = this.defines;
    var eleidarr = parseAction(action);
    var out = [];
    for (var i = 0; i < eleidarr.length; i++) {
        var _c = eleidarr[i], ele = _c[0], id = _c[1];
        if (!defines[ele] || !defines[ele].fields.id)
            return '';
        var at = defines[ele].fields.id.values.indexOf(id);
        out.push((_b = (_a = defines[ele]) === null || _a === void 0 ? void 0 : _a.innertext) === null || _b === void 0 ? void 0 : _b.get(at));
    }
    return out.join('/');
}
function makeElementId(ele, id) {
    return ele + (!isNaN(parseInt(id)) ? '' : '#') + id;
}
function makeChunkAddress(ck, lineoff) {
    var _a, _b, _c;
    if (lineoff === void 0) { lineoff = -1; }
    var scrollto = lineoff ? ((lineoff >= 5) ? ('>' + (lineoff - 1)) : '') + (lineoff ? ':' + lineoff : '') : '';
    return 'bk' + ((parseInt((_a = ck.bk) === null || _a === void 0 ? void 0 : _a.id).toString() == ((_b = ck.bk) === null || _b === void 0 ? void 0 : _b.id)) ? '' : '#') + ((_c = ck.bk) === null || _c === void 0 ? void 0 : _c.id)
        + '.ck' + (!isNaN(parseInt(ck.id)) ? '' : '#') + ck.id
        + scrollto;
}
function tagAtAction(action) {
    //const [start,end]=this.rangeOfAddress(action);
    var arr = parseAction(action);
    var out = Array();
    var parentlinepos = 0;
    for (var i = 0; i < arr.length; i++) {
        var _a = arr[i], tagname = _a[0], id = _a[1];
        if (!this.defines[tagname])
            continue;
        var taglinepos = this.defines[tagname].linepos;
        var tagidarr = this.defines[tagname].fields.id.values;
        var searchfrom = bsearchNumber(taglinepos, parentlinepos);
        if (typeof tagidarr[0] == 'number')
            id = parseInt(id);
        var at = tagidarr.indexOf(id, searchfrom);
        var rel = at - searchfrom;
        if (at < 0)
            at = 0;
        if (rel < 0)
            rel = 0;
        out.push({ tagname: tagname, at: at, rel: rel });
        parentlinepos = taglinepos[at];
    }
    return out;
}
function getTagById(ele, id) {
    var E = this.defines[ele];
    if (!this.defines[ele])
        return null;
    var at = E.fields.id.values.indexOf(id);
    if (!~at)
        return null;
    return this.getTagFields(ele, [at])[0];
}
function fetchTag(ele, id) {
    return __awaiter(this, void 0, void 0, function () {
        var range, _a, start, line, _b, tags, i;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    range = rangeOfElementId.call(this, [[ele, id]]);
                    if (!range.length) return [3 /*break*/, 2];
                    _a = range[0], start = _a[0], _a[1];
                    return [4 /*yield*/, this.loadLines([start, start + 1])];
                case 1:
                    _c.sent();
                    line = this.getLine(start);
                    _b = parseOfftext(line), _b[0], tags = _b[1];
                    for (i = 0; i < tags.length; i++) {
                        if (tags[i].name == ele && tags[i].attrs.id == id) {
                            return [2 /*return*/, tags[i]];
                        }
                    }
                    _c.label = 2;
                case 2: return [2 /*return*/, null];
            }
        });
    });
}
function tagInRange(ele, from, to) {
    var _a;
    if (from === void 0) { from = 0; }
    if (to === void 0) { to = 0; }
    if (!to) {
        to = this.header.eot;
    }
    var linepos = (_a = this.defines[ele]) === null || _a === void 0 ? void 0 : _a.linepos;
    if (!linepos)
        return [];
    var at = bsearchNumber(linepos, from);
    var at2 = bsearchNumber(linepos, to);
    if (linepos[at2] > to)
        at2--;
    return [at, at2];
}
/* count all tag inside address */
function tagCount(address, tag) {
    var _a = this.rangeOfAddress(address), s = _a[0], e = _a[1];
    var _b = this.tagInRange(tag, s, e), first = _b[0], last = _b[1];
    return last - first;
}
function nearestTag(line, tag, fieldname) {
    if (fieldname === void 0) { fieldname = ''; }
    if (typeof tag == 'string')
        tag = this.defines[tag];
    if (!tag)
        return -1;
    var linepos = tag.linepos;
    if (!linepos)
        return null;
    var at = bsearchNumber(linepos, line) - 1;
    var adjustat = (line < linepos[linepos.length - 1]) ? at : at + 1;
    if (!fieldname)
        return adjustat;
    else
        return tag.fields[fieldname].values[adjustat];
}
function findClosestTag(typedef, key, value, from) {
    if (from === void 0) { from = 0; }
    var at = typedef.fields[key].values.indexOf(value);
    while (at >= 0 && typedef.linepos[at] < from) {
        at = typedef.fields[key].values.indexOf(value, at + 1);
    }
    return at;
}
function validId(tagname, id) {
    var _a;
    var V = (_a = this.defines[tagname]) === null || _a === void 0 ? void 0 : _a.fields;
    if (!V || !V.id)
        return false;
    if (V.id.type == 'number' && typeof id !== 'number')
        id = parseInt(id);
    return !!~V.id.values.indexOf(id);
}
function queryTagFields(tagname, q, fields) {
    if (fields === void 0) { fields = []; }
    var tag = this.defines[tagname];
    if (!tag)
        return [];
    var _a = q.split("="), qfield = _a[0], qvalue = _a[1];
    if (!qvalue) {
        qvalue = qfield;
        qfield = "id";
    }
    var atarr = Array();
    var tagfield = tag.fields[qfield];
    if (!tagfield)
        return [];
    var at = tagfield.values.indexOf(qvalue);
    while (~at) {
        atarr.push(at);
        at = tagfield.values.indexOf(qvalue, at + 1);
    }
    return this.getTagFields(tagname, atarr, fields);
}
function getTagFields(tagname, atarr, fields) {
    if (atarr === void 0) { atarr = null; }
    if (fields === void 0) { fields = null; }
    var tag = this.defines[tagname];
    if (!tag)
        return [];
    var res = Array();
    var emitFields = function (at) {
        var out = { at: at };
        if (fields) {
            for (var i = 0; i < fields.length; i++) {
                var f = tag.fields[fields[i]];
                if (f)
                    out[fields[i]] = f.values[at];
            }
        }
        else { //return all fields
            for (var field in tag.fields) {
                if (tag.fields[field].values[at])
                    out[field] = tag.fields[field].values[at];
            }
            out["innertext"] = tag.getInnertext(at);
        }
        return out;
    };
    if (!atarr) {
        for (var i = 0; i < tag.count; i++) {
            res.push(emitFields(i));
        }
    }
    else {
        for (var i = 0; i < atarr.length; i++) {
            res.push(emitFields(atarr[i]));
        }
    }
    return res;
}
function alignable(fn) {
    var out = Array();
    if (!fn)
        return out;
    //only off can align with other off
    if (!fn.endsWith(".off"))
        fn += ".off";
    var H = this.header;
    var at = H.sectionnames.indexOf(fn);
    if (!~at)
        return out;
    var length = H.sectionstarts[at + 1] - H.sectionstarts[at];
    for (var i = 0; i < H.sectionnames.length; i++) {
        var n = H.sectionnames[i];
        if (i == at)
            continue;
        var len = H.sectionstarts[i + 1] - H.sectionstarts[i];
        if (len == length && n.match(/^[a-z]/)
            && n.endsWith('.off') && n !== H.sectionnames[at]) {
            out.push(n.replace(".off", ""));
        }
    }
    return out;
}

/* link to foriegn key */
var LinkField = /** @class */ (function (_super) {
    __extends(LinkField, _super);
    function LinkField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.invertlinks = {};
        _this.type = 'link';
        _this.count = 0;
        return _this;
    }
    LinkField.prototype.validate = function (value, line) {
        var addr = parseAddress(value);
        var act = parseAction(addr.action);
        if (!this.invertlinks[addr.ptkname])
            this.invertlinks[addr.ptkname] = {};
        var invertlinks = this.invertlinks[addr.ptkname];
        if (act.length !== 2) ;
        for (var i = 0; i < act.length; i++) {
            var _a = act[i], ele = _a[0], id = _a[1];
            if (i == 0 && !act[i][1]) {
                ele = 'bk';
                id = act[i][0];
            }
            var eleid = makeElementId(ele, id);
            if (i == act.length - 1) { //leaf
                if (!invertlinks[ele])
                    invertlinks[ele] = {};
                if (!invertlinks[ele][id])
                    invertlinks[ele][id] = [];
                invertlinks[ele][id].push(this.count);
                this.count++;
            }
            else {
                if (!invertlinks[eleid]) {
                    invertlinks[eleid] = {};
                }
                invertlinks = invertlinks[eleid];
            }
        }
        return [0, value];
    };
    LinkField.prototype.serializeLinks = function (bklinks) {
        //assuming bk.ck or bk.n , ak.n
        //反連結只能快速知道某個ck or n 有沒有被連
        //精確的定位必須讀取原連結 才會取得
        var out = [];
        for (var bk in bklinks) {
            var links = bklinks[bk];
            for (var targettag in links) {
                var arr = [];
                for (var id in links[targettag]) {
                    arr.push([id, links[targettag][id]]);
                }
                arr.sort(alphabetically0);
                var chunks = arr.map(function (it) { return it[0]; });
                var idxarr = arr.map(function (it) { return it[1]; });
                out.push(bk);
                out.push(targettag);
                out.push(chunks.join(LEMMA_DELIMITER));
                out.push(packInt2d(idxarr));
            }
        }
        return out;
    };
    LinkField.prototype.serialize = function () {
        var attrs = {};
        //首先寫入原始連結,之後是反連結
        var section = [].concat(this.values); //first link is link count of each target ptk
        for (var ptkname in this.invertlinks) {
            var out = this.serializeLinks(this.invertlinks[ptkname]);
            attrs[ptkname] = out.length; //每個資料庫的連結總數
            section = section.concat(out);
        }
        attrs['*'] = this.values.length; //連結總數
        section.push(JSON.stringify(attrs)); //put at the end
        return section;
    };
    LinkField.prototype.deserialize = function (section, ptk) {
        var attrs = JSON.parse(section.pop());
        var valuelen = attrs['*'];
        var offset = 0;
        for (var db in attrs) {
            if (db == '*')
                continue;
            var datalen = attrs[db];
            while (offset < datalen) {
                var bk = section[valuelen + offset];
                var targettagname = section[valuelen + offset + 1];
                var chunks = new StringArray(section[valuelen + offset + 2], { sep: LEMMA_DELIMITER });
                var idxarr = unpackInt2d(section[valuelen + offset + 3]);
                ptk.addBacklinks(this.name, db, bk, targettagname, chunks, idxarr);
                offset += 4;
            }
        }
        // the raw @ values
        var values = section.slice(0, valuelen);
        section.length = 0;
        return values;
    };
    return LinkField;
}(Field));

/* link to foriegn key */
var KeyField = /** @class */ (function (_super) {
    __extends(KeyField, _super);
    function KeyField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'key';
        return _this;
    }
    KeyField.prototype.validate = function (value, line) {
        //convert items to key index, try foreign key first, 
        var keys = this.keys;
        if (!keys)
            return [exports.VError.NoKeys, value];
        if (!value) { //empty value, validate pass if optional
            return [this.optional ? 0 : exports.VError.Mandatory, []];
        }
        var at = bsearch(keys, value);
        if (keys[at] !== value) {
            return [exports.VError.NoKey, []];
        }
        else {
            return [0, at];
        }
    };
    return KeyField;
}(Field));

/* multiple key separated by comma */
var KeysField = /** @class */ (function (_super) {
    __extends(KeysField, _super);
    function KeysField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'keys';
        return _this;
    }
    KeysField.prototype.validate = function (value, line) {
        //convert items to key index, try foreign key first, 
        var keys = this.keys;
        if (!keys)
            return [exports.VError.NoKeys, value];
        if (!value) { //empty value, validate pass if optional
            return [this.optional ? 0 : exports.VError.Mandatory, []];
        }
        var items = value.split(',').map(function (it) {
            if (!it)
                return 0;
            var at = bsearch(keys, it);
            if (keys[at] === it) {
                return at;
            }
            else {
                return -1;
            }
        }).filter(function (it) { return !!it; }).sort(function (a, b) { return a - b; });
        if (items.filter(function (it) { return it === -1; }).length) {
            return [exports.VError.NoKey, []];
        }
        else {
            return [0, items];
        }
    };
    return KeysField;
}(Field));

var TextField = /** @class */ (function (_super) {
    __extends(TextField, _super);
    function TextField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'text';
        return _this;
    }
    return TextField;
}(Field));

var NumberField = /** @class */ (function (_super) {
    __extends(NumberField, _super);
    function NumberField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'number';
        _this.name = name;
        _this.sortedIndex = null;
        return _this;
    }
    NumberField.prototype._sort = function () {
        var _a;
        _a = sortNumberArray(this.values), this.values = _a[0], this.sortedIndex = _a[1];
    };
    NumberField.prototype.find = function (value) {
        if (!this.values.length)
            return -1;
        if (!this.sortedIndex)
            this._sort();
        var at = bsearch(this.values, value);
        return this.values[at] == value ? this.sortedIndex[at] : -1;
    };
    NumberField.prototype.validate = function (value, line) {
        var n = parseInt(value);
        if (n.toString() !== value && (value === null || value === void 0 ? void 0 : value.length)) {
            return [exports.VError.NotANumber, line]; //default to 0
        }
        if (this.pattern && !value.match(this.pattern)) {
            return [exports.VError.Pattern, 0];
        }
        if (this.unique && n >= 0) {
            if (this.unique[value]) { //found in this line, cannot be zero
                return [exports.VError.NotUnique, 'tag:' + this.name + ', value:' + value, this.unique[value]]; //send ref line
            }
            else {
                this.unique[value] = line; //first occurance
            }
        }
        return [0, parseInt(value)];
    };
    return NumberField;
}(Field));

var NumbersField = /** @class */ (function (_super) {
    __extends(NumbersField, _super);
    function NumbersField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'numbers';
        return _this;
    }
    NumbersField.prototype.validate = function (value, line) {
        if (typeof value == 'undefined') {
            console.log('undefined', line);
        }
        var items = value.split(',').filter(function (it) { return !!it; });
        var out = [];
        for (var i = 0; i < items.length; i++) {
            var v = items[i];
            var n = parseInt(items[i]);
            if (n.toString() !== v && v.length) {
                return [exports.VError.NotANumber, line]; //default to 0
            }
            if (this.pattern && !v.match(this.pattern)) {
                return [exports.VError.Pattern, line];
            }
            out.push(n);
        }
        return [0, out];
    };
    return NumbersField;
}(Field));

var FileLinePosField = /** @class */ (function (_super) {
    __extends(FileLinePosField, _super);
    function FileLinePosField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = 'filelinepos';
        _this.prevfn = '';
        return _this;
    }
    FileLinePosField.prototype.validate = function (value, line, compiledFiles) {
        var arr = value.split(',');
        var out = [];
        var linestart = 0;
        for (var i = 0; i < arr.length; i++) {
            var v = parseInt(arr[i]);
            if (isNaN(v)) {
                var f = compiledFiles[arr[i]];
                if (!f) {
                    throw "no such file " + arr[i];
                }
                linestart = f.linestart;
            }
            else {
                out.push(linestart + v);
            }
        }
        return [0, out];
    };
    return FileLinePosField;
}(Field));

//must by sorted, one per tsv, for categorization
var GroupField = /** @class */ (function (_super) {
    __extends(GroupField, _super);
    function GroupField(name, def) {
        var _this = _super.call(this, name, def) || this;
        _this.type = def.type || 'range';
        _this.ranges = {};
        return _this;
    }
    GroupField.prototype.validate = function (value, line) {
        //convert items to key index, try foreign key first, 
        if (!value) { //empty value, validate pass if optional
            return [this.optional ? 0 : VError.Mandatory, []];
        }
        if (!this.ranges[value])
            this.ranges[value] = [];
        this.ranges[value].push(line);
        if (isNaN(value)) {
            throw "group index should be numeric";
        }
        return [0, parseInt(value)];
    };
    GroupField.prototype.serialize = function (out) {
        var keys = Object.keys(this.ranges);
        keys.sort(alphabetically);
        out.push(keys.join(LEMMA_DELIMITER));
        var delta2d = [];
        for (var i = 0; i < keys.length; i++) {
            delta2d.push(this.ranges[keys[i]]);
        }
        out.push(packIntDelta2d(delta2d));
        out.push();
    };
    GroupField.prototype.deserialize = function (section) {
        var keys = (section.shift() || '').split(LEMMA_DELIMITER);
        var arr = unpackIntDelta2d(section.shift());
        for (var i = 0; i < keys.length; i++) {
            this.ranges[keys[i]] = arr[i];
        }
    };
    return GroupField;
}(Field));

/* validate an attribute of tag or a tsv field*/
function createField(name, def, primarykeys, ownkeys) {
    if (ownkeys === void 0) { ownkeys = false; }
    if (typeof def !== 'string') {
        return new Field(name, def);
    }
    var v;
    var m = def.match(/([a-z_]+):?([a-z_]*)\/?(.*)/);
    if (!m) {
        return;
    }
    var typename = m[1], foreign = m[2];
    var pat = m[3], pattern;
    if (pat) {
        var at2 = pat.lastIndexOf('/');
        var regopts = '';
        if (at2 > 0) {
            regopts = pat.slice(at2 + 1);
            pat = pat.slice(0, at2);
        }
        pattern = new RegExp(pat, regopts);
    }
    if (typename === 'number')
        v = new NumberField(name, { pattern: pattern, foreign: foreign });
    else if (typename === 'numbers')
        v = new NumbersField(name, { pattern: pattern, foreign: foreign });
    else if (typename === 'filelinepos')
        v = new FileLinePosField(name, { pattern: pattern, foreign: foreign });
    else if (typename === 'unique_number')
        v = new NumberField(name, { pattern: pattern, unique: true, optional: false, foreign: foreign });
    else if (typename === 'unique')
        v = new TextField(name, { pattern: pattern, unique: true, optional: false, foreign: foreign });
    else if (typename === 'string')
        v = new Field(name, { pattern: pattern, foreign: foreign });
    else if (typename === 'link')
        v = new LinkField(name, { pattern: pattern, foreign: foreign });
    else if (typename === 'text')
        v = new TextField(name, { pattern: pattern });
    else if (typename === 'key') {
        var keys = (primarykeys && primarykeys[foreign]) || ownkeys;
        v = new KeyField(name, { keys: keys, pattern: pattern, foreign: foreign, optional: false });
    }
    else if (typename === 'keys') {
        var keys = (primarykeys && primarykeys[foreign]) || ownkeys;
        v = new KeysField(name, { keys: keys, pattern: pattern, foreign: foreign });
    }
    else if (typename === 'group') {
        v = new GroupField(name, { type: typename });
    }
    else if (typename === 'note') {
        var keys = (primarykeys && primarykeys[foreign]) || ownkeys;
        v = new Field(name, { type: typename, keys: keys, pattern: pattern, foreign: foreign });
    }
    else if (typename === 'confer') {
        v = new Field(name, { type: typename, foreign: foreign });
    }
    if (!v)
        v = new Field(name, {}); //no validation is perform , just to suppress tag nodef warning
    return v;
}
/* for validate_z only, move to a zField */
// this.toc=[];
// this.zcount=0;
// this.prevzline=0;
// this.prevdepth=0;
function validate_z(offtext, tag) {
    var depth = parseInt(tag.name.slice(1, 2), 36) - 10;
    if (isNaN(depth))
        return; //invalid z
    if (!(depth == this.prevdepth || depth == this.prevdepth + 1 || depth < this.prevdepth)) {
        var msg = '目彔深度错误 ' + this.prevdepth + '+1!=' + depth;
        this.errors.push({ msg: msg, offset: tag.offset, prev: this.prevzline });
    }
    var text = offtext.tagText(tag);
    var closebracket = closeBracketOf(text);
    if (text.slice(text.length - 1) == closebracket)
        text = text.slice(1, text.length - 1);
    var line = this.compiledLine + this.line;
    this.toc.push({ depth: depth, text: text, key: this.zcount, line: line });
    this.zcount++;
    this.prevzline = line;
    this.prevdepth = depth;
}
//只是將 ya3 ，tagname "y", id "a3", 存起來，以後再validate
//TODO , check unique and in order
function addtag_y(offtext, tag) {
    var typedef = this.typedefs.y;
    typedef.linepos.push(this.compiledLine + this.line);
    var V = typedef.fields.id;
    V.values.push(tag.name.slice(1) + (tag.attrs.id || ''));
    var text = removeBracket(offtext.tagText(tag));
    typedef.innertext.push(text);
    typedef.count++;
}
//內文跳轉
function addtag_x(offtext, tag) {
    var typedef = this.typedefs.x;
    typedef.linepos.push(this.compiledLine + this.line);
    var V = typedef.fields.id;
    var id = (tag.attrs.id + (tag.attrs.ln ? ('@' + tag.attrs.ln) : '')) || '';
    V.values.push(tag.name.slice(1) + id);
    var text = removeBracket(offtext.tagText(tag));
    typedef.innertext.push(text);
    //translate 
    typedef.count++;
}

/* store in column oriented */
var Column = /** @class */ (function () {
    function Column(opts) {
        if (opts === void 0) { opts = {}; }
        this.fieldvalues = [];
        this.fieldnames = [];
        this.fieldsdef = [];
        this.name = '';
        this.keys = null; //keys, null if keytype==serial 
        this.primarykeys = opts.primarykeys || {};
        this.onError = opts.onError;
        this.typedef = opts.typedef;
        this.tokenfield = -1; // 0 tokenize the key field, 1 first field 
        this.tokentable = {}; //快速知道有沒有這個token，免去除, runtime 是 Object
        this.runtimetokentable = Array();
    }
    //lexicon :: key(sorted primary key) = payload
    Column.prototype.addColumn = function (name) {
        this.fieldnames.push(name);
        this.fieldvalues.push([]);
    };
    Column.prototype.tokenizeField = function (value) {
        var tokenized = tokenize$1(value);
        for (var i = 0; i < tokenized.length; i++) {
            var _a = tokenized[i], text = _a.text, type = _a.type;
            if (type > exports.TokenType.SEARCHABLE && !this.tokentable[text]) {
                this.tokentable[text] = true;
            }
        }
    };
    Column.prototype.addRow = function (fields, nrow, skipFirstField, compiledFiles) {
        var i = 0;
        if (skipFirstField)
            i++;
        for (; i < this.fieldsdef.length; i++) { //fields.length might be less than this.fieldsdef
            var F = this.fieldsdef[i];
            var _a = F.validate(fields[i], nrow, compiledFiles), err = _a[0], value = _a[1];
            if (err) {
                this.onError && this.onError(err, this.fieldnames[i] + ' ' + fields[i], -1, nrow);
            }
            this.fieldvalues[i].push(value || '');
            if (i + 1 == this.tokenfield)
                this.tokenizeField(value);
        }
    };
    Column.prototype.createFields = function (typedef) {
        if (typedef)
            for (var idx in typedef) {
                var fieldtype = typedef[idx] || 'key=string';
                var _a = fieldtype.split('='), name_1 = _a[0], def = _a[1];
                this.addColumn(name_1);
                var field = createField(name_1, def || {}, this.primarykeys, this.keys);
                this.fieldsdef.push(field);
            }
    };
    Column.prototype.deserialize = function (section) {
        var _a;
        if (!section.length)
            return;
        var firstline = section.shift();
        var _b = parseOfftext(firstline), text = _b[0], tags = _b[1];
        if (!section.length)
            return;
        this.attrs = (_a = tags[0]) === null || _a === void 0 ? void 0 : _a.attrs;
        this.name = this.attrs.name;
        this.caption = this.attrs.caption;
        var typedef = text.split('\t'); // typdef of each field , except field 0
        this.createFields(typedef);
        if (this.attrs.keytype == 'serial') {
            this.keys = null;
        }
        else {
            this.keys = new StringArray(section.shift(), { sep: LEMMA_DELIMITER }); //local keys
        }
        if (this.attrs.tokenfield) {
            this.tokenfield = parseInt(this.attrs.tokenfield);
            this.runtimetokentable = (section.shift() || '').split(LEMMA_DELIMITER);
            this.runtimetokentable.sort(alphabetically);
        }
        var idx = 0, usesection = false;
        for (var fieldname in this.fieldsdef) {
            var field = this.fieldsdef[fieldname];
            if (field.type === 'number') {
                this.fieldvalues[idx] = unpackInt(section.shift());
            }
            else if (field.type === 'numbers') {
                this.fieldvalues[idx] = unpackIntDelta2d(section.shift());
            }
            else if (field.type === 'filelinepos') {
                this.fieldvalues[idx] = unpackIntDelta2d(section.shift());
            }
            else if (field.type === 'keys') {
                this.fieldvalues[idx] = unpackIntDelta2d(section.shift());
            }
            else if (field.type === 'key') {
                this.fieldvalues[idx] = unpackInt(section.shift());
            }
            else if (field.type === 'string') {
                this.fieldvalues[idx] = section.shift().split(LEMMA_DELIMITER);
            }
            else if (field.type === 'group') {
                field.deserialize(section); //deserialize the group index
                this.fieldvalues[idx] = unpackInt(section.shift()); //deserialize the value
            }
            else if (field.type === 'text') {
                usesection = true;
                this.fieldvalues[idx] = section;
            }
            //short hand
            if (!this[field.name]) {
                this[field.name] = this.fieldvalues[idx];
            }
            idx++;
        }
        if (!usesection && section.length) {
            console.log('section not consumed');
        }
    };
    Column.prototype.fromStringArray = function (sa, attrs, from, compiledFiles) {
        if (attrs === void 0) { attrs = {}; }
        if (from === void 0) { from = 1; }
        var allfields = Array();
        var line = sa.first();
        var textstart = 0; // starting of indexable text
        var skipFirstField = false;
        while (from > 0) {
            line = sa.next();
            from--;
        }
        while (line || line === '') {
            var fields = line.split('\t');
            allfields.push(fields);
            line = sa.next();
        }
        if (attrs.keytype !== 'serial') {
            allfields.sort(alphabetically0);
            skipFirstField = true;
            this.keys = allfields.map(function (it) { return it[0]; });
        }
        this.createFields(this.typedef);
        if (attrs.tokenfield) {
            this.tokenfield = parseInt(attrs.tokenfield || -1);
            //simply build token table without posting
            this.tokentable = {};
            if (this.tokenfield === 0)
                this.tokenizeField(this.keys.join(LEMMA_DELIMITER));
        }
        if (!this.fieldnames.length) {
            throw "missing typedef";
        }
        for (var i = 0; i < allfields.length; i++) {
            this.addRow(allfields[i], i + 1, skipFirstField, compiledFiles); //one base
        }
        var out = Array();
        if (this.keys)
            out.push(this.keys.join(LEMMA_DELIMITER));
        if (this.tokenfield > -1) {
            out.push(Object.keys(this.tokentable).join(LEMMA_DELIMITER));
        }
        for (var i = 0; i < this.fieldnames.length; i++) {
            var V = this.fieldsdef[i];
            if (V.type == 'number' || V.type == 'line') {
                var numbers = this.fieldvalues[i].map(function (it) { return parseInt(it) || 0; }) || [];
                //convert line to text line at runtime
                out.push(packInt(numbers));
            }
            else if (V.type == 'numbers' || V.type == 'filelinepos') {
                var numbers = (this.fieldvalues[i]) || [];
                if (numbers.length == 1) {
                    throw "must have more than one array";
                }
                // console.log(numbers)
                out.push(packIntDelta2d(numbers));
            }
            else if (V.type == 'keys') {
                var numnums = (this.fieldvalues[i]) || [];
                out.push(packIntDelta2d(numnums));
            }
            else if (V.type == 'key') {
                var nums = (this.fieldvalues[i]) || [];
                out.push(packInt(nums));
            }
            else if (V.type == 'string') {
                out.push(this.fieldvalues[i].join(LEMMA_DELIMITER));
            }
            else if (V.type == 'group') {
                V.serialize(out);
                out.push(packInt(this.fieldvalues[i]));
            }
            else if (V.type == 'text') {
                if (i !== this.fieldnames.length - 1) { //只有最後的欄位可以為多行text
                    throw "multiline text fieldtype must be the last, " + this.fieldnames[i];
                }
                textstart = out.length;
                for (var j = 0; j < this.fieldvalues[i].length; j++) {
                    out.push(this.fieldvalues[i][j]);
                }
            }
            else if (V.type) {
                this.onError && this.onError(exports.VError.UnknownType, V.type);
            }
        }
        if (textstart == 0)
            textstart = out.length; //no indexable text
        return [out, textstart];
    };
    Column.prototype.fromTSV = function (buffer, attrs, from) {
        if (from === void 0) { from = 1; }
        var sa = new StringArray(buffer, { sequencial: true });
        return this.fromStringArray(sa, attrs, from, this.compiledFiles);
    };
    Column.prototype.toTSV = function () {
        if (!this.keys)
            return '';
        var key = this.keys.first();
        var at = 0;
        var out = Array();
        while (key) {
            var rows = [key];
            for (var i = 1; i < this.fieldvalues.length; i++) {
                rows.push(this.fieldvalues[i][at]);
            }
            key = this.keys.next();
            at++;
            out.push(rows.join('\t'));
        }
        return out.join('\n');
    };
    Column.prototype.findKey = function (key) {
        if (this.keys) {
            return this.keys.find(key.toString());
        }
        else {
            return parseInt(key) - 1;
        }
    };
    Column.prototype.fieldsByKey = function (key) {
        var at = this.findKey(key);
        if (!key)
            return null;
        if (~at) {
            var out = { key: key };
            for (var i = 0; i < this.fieldvalues.length; i++) {
                out[this.fieldnames[i]] = this.fieldvalues[i][at];
            }
            return out;
        }
        else
            return null;
    };
    Column.prototype.fieldByKey = function (key, fieldname) {
        var at = this.findKey(key);
        if (!key)
            return null;
        if (~at) {
            var at2 = this.fieldnames.indexOf(fieldname);
            if (~at2) {
                return this.fieldvalues[at2][at];
            }
            else { //return second field
                return this.fieldvalues[1][at];
            }
        }
        else
            return null;
    };
    Column.prototype.getKey = function (i) {
        if (this.keys) {
            return this.keys.get(i);
        }
        else {
            return (i + 1).toString();
        }
    };
    return Column;
}());

var SourceType;
(function (SourceType) {
    SourceType["Offtext"] = "txt";
    SourceType["TSV"] = "tsv";
    SourceType["Unknown"] = "unknown";
})(SourceType || (SourceType = {}));

/* types of attributes defined by ^:  */
var reservedAttributes = {
    caption: true,
    lazy: false,
    key: true,
    field: true,
    text: true,
    type: true //name of painter
};
var Typedef = /** @class */ (function () {
    function Typedef(attrs, tagname, primarykeys, typedefs) {
        this.fields = {}; /* attribute might have validator */
        this.mandatory = {};
        this.tagname = tagname;
        this.linepos = [];
        this.typedefs = typedefs; //to other typedefs
        this.innertext = [];
        for (var aname in attrs) {
            var def = attrs[aname];
            var opts = typeof def == 'string' ? def : { optional: false };
            var V = createField(tagname, opts, primarykeys);
            if (V)
                this.fields[aname] = V;
            if (V && !V.optional && !reservedAttributes[aname])
                this.mandatory[aname] = true;
        }
        this.attrs = attrs;
        this.column = ''; //backing column of this tag , see basket/pitaka.ts::init()
        this.count = 0;
        if (this.attrs.resetby) {
            var resettingparents = this.attrs.resetby.split(',');
            for (var i = 0; i < resettingparents.length; i++) {
                var parent_1 = this.typedefs[resettingparents[i]];
                if (parent_1) {
                    if (!parent_1.attrs.reset) {
                        parent_1.attrs.reset = tagname;
                    }
                    else {
                        var arr = parent_1.attrs.reset.split(',');
                        arr.push(tagname);
                        parent_1.attrs.reset = unique(arr).join(',');
                    }
                }
                else {
                    console.log("not such parent tag", resettingparents[i]);
                }
            }
        }
    }
    Typedef.prototype.resetChildTag = function () {
        if (this.attrs.reset) {
            var resetting = this.attrs.reset.split(',');
            for (var i = 0; i < resetting.length; i++) {
                var childtypedef = this.typedefs[resetting[i]];
                if (childtypedef) {
                    for (var fieldname in childtypedef.fields) {
                        var field = childtypedef.fields[fieldname];
                        if (field.unique) {
                            // console.log('reset',childtypedef.tagname,fieldname)
                            field.resetUnique();
                        }
                    }
                }
            }
        }
    };
    Typedef.prototype.validateFields = function (tag, line, onError, compiledFiles) {
        var touched = false, newtag;
        this.count++;
        // for (let aname in tag.attrs) {
        for (var aname in this.attrs) {
            var V = this.fields[aname];
            var value = tag.attrs[aname];
            if (V && !V.foreign)
                V.values.push(tag.attrs[aname]);
            var _a = (V && V.validate(tag.attrs[aname], line, compiledFiles)) || [0, value, -1], err = _a[0], newvalue = _a[1], refline = _a[2];
            if (err) {
                onError(err, newvalue, refline);
            }
            else { // if (newvalue!=value) { //type cast here  
                if (!touched) {
                    newtag = Object.assign({}, tag);
                    newtag.attrs = Object.assign({}, tag.attrs);
                }
                if (Array.isArray(newvalue))
                    newvalue = newvalue.join(',');
                newtag.attrs[aname] = newvalue;
                touched = true;
            }
        }
        return newtag;
    };
    Typedef.prototype.validateTag = function (offtext, tag, line, compiledLine, compiledFiles, onError) {
        if (this.fields.id || this.fields['@'] || this.fields.ln || this.attrs.savelinepos) { //auto save linepos if validating id
            this.linepos.push(compiledLine + line);
        }
        if (this.attrs.bracket) { // false to keep the bracket
            var tagtext = offtext.tagText(tag);
            if (!tagtext) { //use entire line as innertext
                tagtext = offtext.plain.trim() || "noname";
            }
            if (this.attrs.bracket !== 'true')
                tagtext = removeBracket(tagtext);
            this.innertext.push(tagtext.slice(0, 15));
            //if (this.tagname=='ak'||this.tagname=='bk') console.log(tagtext,tag)
        }
        for (var aname in this.mandatory) {
            if (!tag.attrs.hasOwnProperty(aname) && this.mandatory[aname]) {
                onError(exports.VError.Mandatory, tag.name + ' ' + aname);
            }
        }
        this.resetChildTag();
        var newtag = this.validateFields(tag, line, onError, compiledFiles);
        return newtag;
    };
    Typedef.prototype.deserialize = function (section, ptk, sectionmame) {
        var attrline = section.shift();
        var attrs = attrline ? attrline.split(LEMMA_DELIMITER) : [];
        if (section.length > attrs.length) {
            this.linepos = unpackIntDelta(section.shift());
            this.count = this.linepos.length;
        }
        if (!section.length)
            return;
        if (this.fields.bracket) {
            this._innertext = new StringArray(section.shift() || '', { sep: LEMMA_DELIMITER });
        }
        for (var i = 0; i < attrs.length; i++) {
            var aname = attrs[i];
            var V = this.fields[aname];
            if (!V) {
                console.error("unknown type " + aname);
                continue;
            }
            if ((V === null || V === void 0 ? void 0 : V.type) === 'number') {
                V.values = unpackInt(section.shift());
            }
            else if ((V === null || V === void 0 ? void 0 : V.type) === 'text') {
                V.values = section.length ? (section.shift() || '').split('\t') : [];
            }
            else if (V === null || V === void 0 ? void 0 : V.deserialize) {
                V.values = V.deserialize(section, ptk);
            }
        }
        if (section.length) {
            console.log("unconsumed section lines", section.length, sectionmame);
        }
    };
    Typedef.prototype.serialize = function () {
        var attrs = Array(), out = Array();
        if (!this.count)
            return null;
        if (this.linepos.length || this.fields.bracket) {
            //if innertext exists , must pack linepos even if empty
            out.push(packIntDelta(this.linepos));
        }
        if (this.fields.bracket) {
            out.push((this.innertext || []).join(LEMMA_DELIMITER));
        }
        for (var aname in this.fields) {
            var V = this.fields[aname];
            if (V.foreign)
                continue;
            if (V.type == 'number') {
                attrs.push(aname);
                out.push(packInt(V.values.map(function (it) { return parseInt(it) || 0; })));
            }
            else if (V.type == 'text') {
                attrs.push(aname);
                out.push(V.values.join('\t'));
            }
            else if (V.serialize) {
                attrs.push(aname);
                var arr = V.serialize();
                for (var i = 0; i < arr.length; i++) {
                    out.push(arr[i]);
                }
            }
        }
        out.unshift(attrs.join(LEMMA_DELIMITER));
        return out.length ? out.join('\n') : null;
    };
    Typedef.prototype.getInnertext = function (i) {
        var _a;
        return ((_a = this._innertext) === null || _a === void 0 ? void 0 : _a.get(i)) || '';
    };
    return Typedef;
}());

/* todo , pb defined resetby=bk  */
var predefines = {
    generic: "^:ak<id=unique bracket=false reset=n>\n^:bk<id=unique heading=text bracket=false reset=ck,dk,juan aligncaption=text>\n^:ck<id=unique heading=text bracket=false>\n^:dk<id=unique>\n^:h<id=text>\n^:end<id=text>\n^:p<id=text>\n^:b<bracket=false>\n^:n<id=number>\n^:pn<id=text>\n^:ii<bracket=false>\n^:quote\n^:fig<bracket=false>\n^:image\n^:quotei\n^:s<bracket=false>\n^:folio<id=number>\n^:m<id=text>\n^:juan<id=number>\n^:o<@=link>\n^:j<@=link>\n^:k<id=text>\n^:wiki\n^:png<id=text src=text>\n^:svg<id=text>\n^:uiicon<id=text>\n^:jpg<src=text>\n^:ad\n^:bc\n^:gatha\n^:au\n^:cut\n^:paste\n^:notranslation\n^:ver<savelinepos=true>\n^:f<id=text>\n^:i<bracket=false @=text savelinepos=true>\n^:sponsor<savelinepos=true>\n^:https<bracket=false onclick=gourl>\n^:fn<id=text>\n^:t\n^:x<id=text @=text bracket=false savelinepos=true>\n^:y<id=unique bracket=false savelinepos=true>\n^:connect<source=text target=text book=text>\n^:ln<from=text to=text pin=text>\n^:bb\n^:audio\n^:clip\n^:img\n^:sz\n^:sc\n^:missing\n^:misalign\n^:ff\n^:part\n^:vaggo\n^:errorpunc\n^:puncerror\n^:error\n^:doubt\n^:tofix\n^:add\n^:pg\n^:swap\n^:move\n^:baidu\n^:note\n^:miss\n^:person\n^:diff\n^:corr",
    cbeta: "^:ak<id=unique bracket=false>\n^:bk<id=unique heading=text bracket=false reset=ck,p>\n^:ck<id=unique heading=text bracket=false>\n^:https<bracket=false onclick=gourl>\n^:p<id=text>\n^:f<id=text>\n^:ver<savelinepos=true>\n^:fn<id=number>\n^:fm<id=text>\n^:k<id=text>\n^:j<@=link>\n^:v\n^:h\n^:mc\n^:l",
    cs: "^:ak<id=unique bracket=false>\n^:bk<id=unique heading=text bracket=false>\n^:ck<id=unique heading=text bracket=false>\n^:n<id=unique resetby=bk>\n^:p<id=number>\n^:ti<id=number heading=text bracket=false>\n^:f<id=number>\n^:h\n^:sz\n^:ckan\n^:cksn\n^:https<bracket=false onclick=gourl>\n^:t",
    zidian: "^:ak<id=unique bracket=false reset=ck>\n^:bk<id=unique heading=text bracket=false reset=n>\n^:ck<id=unique heading=text bracket=false>\n^:f<id=number>\n^:https<bracket=false onclick=gourl>\n^:j<@=link>\n^:o<@=link>\n",
    subtitle: "^:ak<id=unique bracket=false reset=n>\n^:bk<id=unique heading=text bracket=false reset=ck>\n^:ck<id=unique heading=text bracket=false>\n^:mpeg<id=text savelinepos=true>\n^:ts<id=range>\n^:ver<savelinepos=true>"
};

/*以文字連結注釋
^ck5
^f<@釋目>(顯示文字)     word 顯

tsv footnote=ck
5.釋目  解釋

兩種不能混用
*/
var groupnotes = function (notekeys) {
    var Notes = {};
    for (var i = 0; i < notekeys.length; i++) {
        var m = notekeys[i].match(/(\d+)\.(.+)/);
        if (!m)
            throw "invalid note " + notekeys[i] + " filename:" + filename;
        if (!Notes[m[1]])
            Notes[m[1]] = {};
        if (Notes[m[1]][m[2]]) {
            throw "repeat note " + notekeys[i];
        }
        Notes[m[1]][m[2]] = 0;
    }
    return Notes;
};
//檢查每個內文及 tsv 是否能對映
function checkInlineFootnote(attrs, notekeys) {
    //group notekeys
    var Notes = groupnotes(notekeys);
    var tagname = attrs.footnote || 'bk';
    var tag = this.typedefs[tagname];
    var itag = this.typedefs.i;
    for (var i = 0; i < tag.fields.id.values.length; i++) {
        var groupid = tag.fields.id.values[i];
        var from = tag.linepos[i];
        var to = tag.linepos[i + 1];
        var start = bsearchNumber(itag.linepos, from);
        var end = bsearchNumber(itag.linepos, to);
        if (itag.linepos[start] < from)
            continue;
        if (!end || itag.linepos[end] < to)
            end = itag.linepos.length; //fix last item
        var offtextfootnote = itag.innertext.slice(start, end);
        for (var j = start; j < end; j++) {
            if (itag.fields.ln && itag.fields.ln.values[j]) { //has alias replace it 
                offtextfootnote[j - start] = itag.fields.ln.values[j];
            }
        }
        for (var j = 0; j < offtextfootnote.length; j++) {
            var gid = groupid; // use local chunk id if not specified
            var f = offtextfootnote[j];
            var at = f.indexOf('.');
            if (at > 0) { //specified
                gid = f.slice(0, at);
                f = f.slice(at + 1);
                if (!f) { // use innertext if only specified chunk id, e.g ^i10<@1.>(半自耕農)
                    f = itag.innertext[j + start];
                }
            }
            if (!Notes[gid]) {
                console.log('no such id', gid, f, tagname, tag.fields.id.values);
                continue;
            }
            if (Notes[gid].hasOwnProperty(f)) {
                Notes[gid][f]++;
            }
            else {
                console.log(tagname + '#' + groupid, 'not found', offtextfootnote[j], j);
            }
        }
        // console.log(groupid,start,end,offtextfootnote);
    }
}
/*以id連結注釋
^f11
tsv footnote=bk
11   解釋
*/
function checkFootnote(attrs, notekeys, filename) {
    if (!attrs.footnote)
        return;
    var tagname = attrs.footnote || 'bk'; //default name same with bk
    var tag = this.typedefs[tagname];
    var ftag = this.typedefs.f;
    if (!tag) {
        console.log('unknown tag', tag, 'checkfootnote');
        return;
    }
    if (this.typedefs.i) { //try inline footnote
        checkInlineFootnote.call(this, attrs, notekeys);
    }
    if (!ftag) {
        console.log('no f tag in source');
        return;
    }
    if (tagname == 'bk') { //id is simple number, cannot mix with i
        //note tsv name == bk name
        var at = tag.fields.id.values.indexOf(attrs.name);
        var from = tag.linepos[at];
        var to = tag.linepos[at + 1] || this.compiledLine; //assuming foot note just after off
        var start = bsearchNumber(ftag.linepos, from);
        var end = bsearchNumber(ftag.linepos, to);
        if (ftag.linepos[start] > from) {
            if (!end || ftag.linepos[end] < to)
                end = ftag.linepos.length; //fix last item
            var offtextfootnote = ftag.fields.id.values.slice(start, end).sort(alphabetically);
            if (offtextfootnote.join() !== notekeys.join()) {
                console.log(filename, 'footnote missing match', arraydiff(notekeys, offtextfootnote), notekeys.join());
            }
        }
    }
    else { //id prefix with chunk or other tag
        var Notes = groupnotes(notekeys);
        for (var key in Notes) {
            var notes = Notes[key];
            var at = tag.fields.id.values.indexOf(key);
            var from = tag.linepos[at];
            var to = tag.linepos[at + 1] || this.compiledLine; //assuming foot note just after off
            var start = bsearchNumber(ftag.linepos, from);
            var end = bsearchNumber(ftag.linepos, to);
            var offtextfootnote = ftag.fields.id.values.slice(start, end).sort(alphabetically);
            for (var i = 0; i < offtextfootnote.length; i++) {
                var id = offtextfootnote[i];
                if (!notes.hasOwnProperty(id)) {
                    console.log('no note for ^f' + id, 'in ^' + tagname + key);
                }
                else
                    notes[id]++;
            }
        }
    }
}

var sourceType = function (firstline, filename) {
    var _a;
    if (filename === void 0) { filename = ''; }
    var at = firstline.indexOf('\n');
    var lazy = true, name = '', caption = '', tag;
    var consumed = false;
    var sourcetype = SourceType.Unknown;
    if (filename) {
        if (filename.endsWith('.tsv'))
            sourcetype = SourceType.TSV;
        if (filename.endsWith('.off'))
            sourcetype = SourceType.Offtext;
    }
    firstline = at > -1 ? firstline.slice(0, at) : firstline;
    var _b = parseOfftext(firstline); _b[0]; var tags = _b[1];
    if (tags.length && tags[0].name == ':') { //directive
        var attrs = tags[0].attrs;
        if (attrs.hasOwnProperty("lazy"))
            lazy = !!attrs.lazy;
        sourcetype = ((_a = tags[0].attrs.type) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || sourcetype;
        name = attrs.name;
        caption = attrs.caption;
        consumed = true;
        if (sourcetype == 'tsv') {
            consumed = false;
            lazy = false;
        }
        tag = tags[0];
    }
    // console.log(filename,sourcetype);
    return { sourcetype: sourcetype, tag: tag, lazy: lazy, name: name, caption: caption, consumed: consumed };
};
var CompiledFile = /** @class */ (function () {
    function CompiledFile() {
        this.errors = [];
        this.tagdefs = [];
        this.processed;
        this.sourcetype = '';
    }
    return CompiledFile;
}());
var Compiler = /** @class */ (function () {
    function Compiler(opts) {
        if (opts === void 0) { opts = {}; }
        this.reset(opts);
    }
    Compiler.prototype.reset = function (opts) {
        //this.ptkname=''; do not reset ptkname
        this.compilingname = '';
        this.line = 0;
        this.compiledLine = 0;
        this.compiledFiles = {};
        this.primarykeys = {};
        this.errors = [];
        this.typedefs = {};
        this.stopcompile = false;
        this.tagdefs = []; // defines provided by the library, will be added to 000.js payload
        this.backtransclusions = {};
        //for y tag
        //for z tag
        this.toc = [];
        this.zcount = 0;
        this.prevzline = 0;
        this.prevdepth = 0;
    };
    Compiler.prototype.onError = function (code, msg, refline, line) {
        if (refline === void 0) { refline = -1; }
        this.errors.push({ name: this.compilingname, line: (line || this.line), code: code, msg: msg, refline: refline });
        if (this.errors.length >= MAX_VERROR)
            this.stopcompile = true;
    };
    Compiler.prototype.setPredefine = function (name) {
        if (name === void 0) { name = "generic"; }
        var predefine = predefines[name] || '';
        this.compileOfftext(predefine, this.tagdefs);
    };
    Compiler.prototype.compileOfftext = function (str, tagdefs) {
        var at = str.indexOf('^');
        if (at == -1)
            return str; //nothing to do
        var ot = new Offtext(str);
        for (var i = 0; i < ot.tags.length; i++) {
            var tag = ot.tags[i];
            var tagstr = str.slice(tag.offset, tag.end);
            if (tag.name[0] == ':' && tag.name.length > 1) {
                var newtagname = tag.name.slice(1);
                if (this.typedefs[newtagname]) {
                    this.onError(exports.VError.TypeRedef, newtagname);
                }
                else {
                    this.typedefs[newtagname] = new Typedef(tag.attrs, newtagname, this.primarykeys, this.typedefs);
                }
                tagdefs.push(tagstr);
            }
            else {
                if (tag.name[0] == 'z') {
                    validate_z.call(this, ot, tag);
                }
                else if (tag.name[0] == 'y') {
                    addtag_y.call(this, ot, tag);
                }
                else if (tag.name[0] == 'x') {
                    addtag_x.call(this, ot, tag);
                }
                else if (tag.name !== ':') {
                    if (!tag.name) { //目前只處理 ^[]
                        var innertext = ot.tagText(tag, true);
                        var _a = parseTransclusion('^[' + innertext + ']'); _a[0]; var link = _a[1];
                        if (!this.backtransclusions[link]) {
                            this.backtransclusions[link] = new Array;
                        }
                        this.backtransclusions[link].push(this.compiledLine + this.line);
                    }
                    else {
                        var typedef = this.typedefs[tag.name];
                        if (!typedef) {
                            console.error('unknown tag\n', tag.name);
                            //this.onError(VError.TypeTagName);
                        }
                        else {
                            var newtag = typedef.validateTag(ot, tag, this.line, this.compiledLine, this.compiledFiles, this.onError.bind(this));
                            if (newtag) {
                                str = updateOfftext(str, tag, newtag);
                            }
                        }
                    }
                }
            }
        }
        return str;
    };
    Compiler.prototype.clearCompiled = function (filename) {
        delete this.compiledFiles[filename];
    };
    Compiler.prototype.compileBuffer = function (buffer, filename) {
        var _a;
        if (!buffer)
            return this.onError(exports.VError.Empty);
        if (!filename)
            return this.onError(exports.VError.PtkNoName);
        var samepage = false, tagdefs = Array(), attributes = {};
        var sa = new StringArray(buffer, { sequencial: true });
        var firstline = sa.first() || '';
        var _b = sourceType(firstline, filename), sourcetype = _b.sourcetype, tag = _b.tag, lazy = _b.lazy, name = _b.name, caption = _b.caption, consumed = _b.consumed; //only first tag on first line
        if (sourcetype == 'txt' && consumed)
            tagdefs.push(firstline);
        var compiledname = name || filename; //name of this section
        var textstart = 0; //starting line of indexable text
        this.compilingname = filename;
        this.stopcompile = false;
        var processed = Array();
        // if (!tag) console.log(firstline,filename);
        if ((tag === null || tag === void 0 ? void 0 : tag.name) == ':') { // system directive
            if (tag.attrs.ptk) {
                if (this.ptkname && this.ptkname !== tag.attrs.ptk) {
                    this.onError(exports.VError.PtkNamed, this.ptkname);
                }
                else {
                    this.ptkname = tag.attrs.ptk;
                }
            }
            //do not set predefine for tsv
            if (tag.attrs.type === 'txt' || filename == '0.off') {
                this.setPredefine(tag.attrs.define || tag.attrs.template);
            }
            attributes = tag.attrs;
        }
        if (!Object.keys(this.tagdefs).length) {
            this.setPredefine(); //use generic incase 0.off not exists
        }
        var linestart = this.compiledLine;
        if (sourcetype === SourceType.TSV) {
            var _c = parseOfftext(firstline), text = _c[0], tags = _c[1];
            // if (!tags.length) {
            // 	throw "invalid tsv, first line must be ^:"
            // }
            var attrs = ((_a = tags[0]) === null || _a === void 0 ? void 0 : _a.attrs) || {};
            var typedef = text.split('\t'); // typdef of each field , except field 0
            var columns = new Column({ typedef: typedef, primarykeys: this.primarykeys, onError: this.onError.bind(this) });
            var _d = columns.fromStringArray(sa, attrs, 1, this.compiledFiles), serialized = _d[0], _textstart = _d[1]; //build from TSV, start from line 1
            if (!attrs.hasOwnProperty("nocheck")) {
                checkFootnote.call(this, attrs, columns.keys, filename);
            }
            textstart = _textstart;
            if (serialized) {
                compiledname = (attrs === null || attrs === void 0 ? void 0 : attrs.name) || filename; //use filename if name is not specified
                serialized.unshift(firstline); //keep the first line
                //primary key can be refered by other tsv
                if (attrs === null || attrs === void 0 ? void 0 : attrs.name)
                    this.primarykeys[attrs.name] = columns.keys;
                this.compiledLine += serialized.length;
                processed = serialized;
                textstart++; //add the first line
                samepage = true; //store in same page
            }
            else {
                processed = [];
            }
        }
        else if (sourcetype === SourceType.Offtext) {
            var out = Array();
            var linetext = sa.first();
            if (consumed)
                linetext = sa.next();
            this.line = 0; //for debugging showing line from begining of offtext file
            while (linetext || linetext === '') {
                var o = this.compileOfftext(linetext, tagdefs);
                if (o || o == '') {
                    out.push(o);
                    this.line++;
                }
                linetext = sa.next();
                if (this.stopcompile)
                    break;
            }
            this.compiledLine += out.length;
            processed = out;
        }
        else { // unknown type
            if (compiledname.endsWith('.num')) {
                var linetext = sa.first();
                var out = Array();
                while (linetext || linetext === '') {
                    var o = packInt(linetext.split(',').map(function (it) { return parseInt(it || '0'); }));
                    out.push(o);
                    linetext = sa.next();
                    if (this.stopcompile)
                        break;
                }
                this.compiledLine += out.length;
                textstart = out.length; //do not index it
                processed = out;
            }
            else {
                throw "unknown extension " + compiledname;
            }
        }
        this.compiledFiles[filename] = { name: compiledname, caption: caption, lazy: lazy, sourcetype: sourcetype, processed: processed, textstart: textstart, errors: this.errors, samepage: samepage, tagdefs: tagdefs, attributes: attributes, linestart: linestart };
        return this.compiledFiles[filename];
    };
    return Compiler;
}());
var serializeBackTransclusion = function (backtransclusions) {
    var keys = Object.keys(backtransclusions);
    var out = [];
    if (!keys.length)
        return [];
    out.push(keys.join(LEMMA_DELIMITER));
    for (var i = 0; i < keys.length; i++) {
        var pos = backtransclusions[keys[i]];
        out.push(packIntDelta(pos));
    }
    return out;
};

var serializeToc = function (toc) {
    var out = Array(), texts = Array(), lines = Array(), depths = Array();
    for (var i = 0; i < toc.length; i++) {
        var _a = toc[i], depth = _a.depth, line = _a.line, text = _a.text;
        depths.push(depth);
        lines.push(line);
        texts.push(text.replace(/\t/g, ' '));
    }
    out.push('^:<type=toc>'); // section name is _toc
    out.push(packIntDelta(lines));
    out.push(packInt(depths));
    out.push(texts.join('\t'));
    //console.log(lines.length,depths.length,texts.length)
    return out;
};
var TableOfContent = /** @class */ (function () {
    function TableOfContent(section) {
        this.lines = unpackIntDelta(section.shift());
        this.depths = unpackInt(section.shift());
        this.texts = new StringArray(section.shift());
    }
    return TableOfContent;
}());
//chunk as toc
var depthOfId = function (str) {
    return str.split(/(\d+)/).filter(function (it) { return !!it; }).length;
};
function buildTocTag(toctags) {
    for (var i = 0; i < toctags.length; i++) {
        var toctag = toctags[i];
        var out = Array();
        if (!this.defines[toctag]) {
            console.log('not such tag', toctag);
            continue;
        }
        var values = this.defines[toctag].fields.id.values;
        for (var j = 0; j < values.length; j++) {
            out.push(depthOfId(values[j]));
        }
        this.defines[toctag].depths = out;
    }
}

var writeTypedefs = function (lbaser, typedefs) {
    for (var tag in typedefs) {
        var typedef = typedefs[tag];
        var serialized = typedef.serialize();
        if (tag == 'ak' && !typedef.linepos.length) {
            console.log('missing ^ak');
        }
        if (serialized) {
            lbaser.append(serialized, { name: '^' + tag, newpage: true, samepage: true, type: 'tag' });
        }
    }
};
var makeLineBaser = function (sourcebuffers_1, compiler_1) {
    var args_1 = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args_1[_i - 2] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([sourcebuffers_1, compiler_1], args_1, true), void 0, function (sourcebuffers, compiler, contentGetter) {
        var lbaser, indexer, alltagdefs, i, buf, text, content, _a, name_1, caption, errors, processed, samepage, lazy, tagdefs, textstart, sourcetype, unindexablelines, toindex, j, text_1, backtransclusions, _b, tokens, postings, wordcount;
        if (contentGetter === void 0) { contentGetter = null; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    lbaser = new LineBaser();
                    if (compiler)
                        compiler.reset();
                    else
                        compiler = new Compiler();
                    indexer = new Indexer();
                    alltagdefs = compiler.tagdefs.concat([]);
                    i = 0;
                    _c.label = 1;
                case 1:
                    if (!(i < sourcebuffers.length)) return [3 /*break*/, 5];
                    buf = sourcebuffers[i];
                    if (!buf) {
                        console.log('empty');
                        return [3 /*break*/, 4];
                    }
                    text = buf.text || '';
                    if (!(!text && contentGetter)) return [3 /*break*/, 3];
                    return [4 /*yield*/, contentGetter(i)];
                case 2:
                    content = _c.sent();
                    text = content.text || '';
                    _c.label = 3;
                case 3:
                    if (buf.name.endsWith('.css'))
                        return [3 /*break*/, 4]; // todo , should check sourcetype
                    compiler.compileBuffer(text, buf.name);
                    if (!compiler.compiledFiles[buf.name]) {
                        return [3 /*break*/, 4];
                    }
                    _a = compiler.compiledFiles[buf.name], name_1 = _a.name, caption = _a.caption, errors = _a.errors, processed = _a.processed, samepage = _a.samepage, lazy = _a.lazy, tagdefs = _a.tagdefs, textstart = _a.textstart, sourcetype = _a.sourcetype;
                    alltagdefs.push.apply(alltagdefs, tagdefs);
                    if (!lazy)
                        lbaser.header.preload.push(name_1);
                    lbaser.append(processed, { name: name_1.replace('*', ''), samepage: samepage, sourcetype: sourcetype });
                    if (errors.length) {
                        console.table(errors);
                        errors.length = 0;
                    }
                    unindexablelines = textstart;
                    while (unindexablelines > 0) {
                        indexer.addLine('');
                        unindexablelines--;
                    }
                    if (textstart < processed.length) {
                        lbaser.header.fulltext.push(name_1);
                        lbaser.header.fulltextcaption.push(caption || name_1);
                        toindex = (textstart ? processed.slice(textstart) : processed);
                        for (j = 0; j < toindex.length; j++) {
                            text_1 = parseOfftext(toindex[j])[0];
                            indexer.addLine(text_1);
                        }
                    }
                    _c.label = 4;
                case 4:
                    i++;
                    return [3 /*break*/, 1];
                case 5:
                    backtransclusions = serializeBackTransclusion(compiler.backtransclusions);
                    indexer.finalize();
                    _b = indexer.serialize(), tokens = _b[0], postings = _b[1], wordcount = _b[2];
                    lbaser.header.eot = lbaser._data.length;
                    lbaser.header.preload.push('_tokens', '_toc');
                    lbaser.header.wordcount = wordcount;
                    tokens.unshift('^:<type="tokens">');
                    lbaser.append(tokens, { newpage: true, name: '_tokens' });
                    lbaser.append(postings, { newpage: true, name: '_postings' });
                    if (compiler.toc.length)
                        lbaser.append(serializeToc(compiler.toc), { newpage: true, name: '_toc' });
                    if (backtransclusions.length) {
                        lbaser.header.preload.push('_backtransclusions');
                        lbaser.append(backtransclusions, { newpage: true, name: '_backtransclusions' });
                    }
                    lbaser.payload = alltagdefs.filter(function (it) { return !!it; }).join('\n');
                    if (!compiler.ptkname) {
                        compiler.ptkname = new Date();
                        return [2 /*return*/, { err: "missing ptk name" }];
                    }
                    writeTypedefs(lbaser, compiler.typedefs);
                    lbaser.setName(compiler.ptkname);
                    lbaser.newPage(); //finalize
                    return [2 /*return*/, lbaser];
            }
        });
    });
};

var nop = function () { return []; };
var addTemplate = function (name, template) {
    Templates[name] = template;
    if (!template.getFilters)
        template.getFilters = nop;
    if (!template.runFilter)
        template.runFilter = nop;
    if (!template.getCorrespondence)
        template.getCorrespondence = nop;
};
var Templates = {};
addTemplate('generic', {});

var regPtkName = /^[a-z\-_]{2,16}$/;
var validPtkName = function (name) { return !!name.match(regPtkName); };
var Pitaka = /** @class */ (function (_super) {
    __extends(Pitaka, _super);
    function Pitaka(opts) {
        var _this = _super.call(this, opts) || this;
        _this.defines = {};
        _this.attributes = {};
        _this.primarykeys = {};
        _this.columns = {};
        _this.inverted = null;
        _this.lang = '';
        return _this;
    }
    Pitaka.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var compiler, ranges, i, r, n, r, i, section, n, section, attr, A, n, n, tagname;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.payload)
                            return [2 /*return*/];
                        compiler = new Compiler();
                        compiler.compileBuffer(this.payload, '0.off');
                        this.defines = compiler.typedefs;
                        this.attributes = (_a = compiler.compiledFiles['0.off']) === null || _a === void 0 ? void 0 : _a.attributes;
                        this.lang = this.attributes.lang || 'zh';
                        this.template = Templates[this.attributes.template] || Templates.generic;
                        ranges = Array();
                        //load required section data
                        for (i = 0; i < this.header.preload.length; i++) {
                            r = this.sectionRange(this.header.preload[i]);
                            if (r && r[1] > r[0])
                                ranges.push(r);
                        }
                        for (n in this.defines) {
                            if (!this.defines[n].fields.lazy) {
                                r = this.sectionRange('^' + n);
                                if (r && r[1] > r[0])
                                    ranges.push(r);
                            }
                        }
                        if (!!this.inmemory) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadLines(ranges)];
                    case 1:
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        for (i = 0; i < this.header.preload.length; i++) {
                            section = this.getSection(this.header.preload[i]);
                            if (section.length)
                                this.deserialize(section, this.header.preload[i]);
                            // else console.error('empty section',this.header.preload[i]);
                        }
                        for (n in this.defines) { //see compiler/typedef.ts serialize()
                            if (!this.defines[n].fields.lazy) {
                                section = this.getSection('^' + n);
                                if (section && section.length) {
                                    this.defines[n].deserialize(section, this, n); //call typedef.ts:deserialize
                                }
                                else {
                                    this.defines[n].empty = true;
                                }
                            }
                            for (attr in this.defines[n].fields) {
                                A = this.defines[n].fields[attr];
                                if (A.foreign && this.primarykeys[A.foreign]) {
                                    A.keys = this.primarykeys[A.foreign];
                                }
                            }
                        }
                        for (n in this.defines) {
                            if (this.defines[n].empty)
                                delete this.defines[n];
                        }
                        //link column and define
                        for (n in this.columns) {
                            tagname = ((_b = this.columns[n].attrs) === null || _b === void 0 ? void 0 : _b.tagname);
                            if (tagname && this.defines[tagname]) {
                                this.defines[tagname].column = n;
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    Pitaka.prototype.deserialize = function (section, sectionname) {
        if (!section.length)
            return;
        if (!section[0])
            section.shift();
        if (!section.length)
            return;
        var firstline = section[0];
        sourceType(firstline).name;
        var at = this.header.sectionnames.indexOf(sectionname);
        var sourcetype = this.header.sectiontypes[at];
        if (sourcetype === 'tsv') { // linebaser.ts addSection()
            var column = new Column();
            column.deserialize(section);
            this.columns[column.name] = column;
            this.primarykeys[column.name] = column.keys;
        }
    };
    Pitaka.prototype.typedefOf = function (tagname) {
        return this.defines[tagname]; //.fields;
    };
    Pitaka.prototype.getSectionStart = function (name) {
        var at = this.header.sectionnames.indexOf(name);
        if (~at) {
            return this.header.sectionstarts[at];
        }
        return -1;
    };
    Pitaka.prototype.getSectionName = function (line) {
        var at = bsearchNumber(this.header.sectionstarts, line + 1) - 1;
        return this.header.sectionnames[at];
    };
    return Pitaka;
}(LineBase));

var makeBuffer = function (size) { return new DataView(new ArrayBuffer(size)); };
var makeUint8Array = function (thing) { return new Uint8Array(thing.buffer || thing); };
var encodeString = function (whatever) { return new TextEncoder().encode(String(whatever)); };
var clampInt32 = function (n) { return Math.min(0xffffffff, Number(n)); };
var clampInt16 = function (n) { return Math.min(0xffff, Number(n)); };
function formatDOSDateTime(date, into, offset) {
    if (offset === void 0) { offset = 0; }
    var dosTime = date.getSeconds() >> 1
        | date.getMinutes() << 5
        | date.getHours() << 11;
    var dosDate = date.getDate()
        | (date.getMonth() + 1) << 5
        | (date.getFullYear() - 1980) << 9;
    into.setUint16(offset, dosTime, true);
    into.setUint16(offset + 2, dosDate, true);
}
var wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwDAwIAAQUDAQACBwkCAW0CAAFjAAEIAQAKlQECSQEDfwNAIAEhAEEAIQIDQCAAQQF2IABBAXFBoIbi7X5scyEAIAJBAWoiAkEIRw0ACyABQQJ0IAA2AgAgAUEBaiIBQYACRw0ACwtJAQF/IAFBf3MhAUGAgAQhAkGAgAQgAGohAANAIAFB/wFxIAItAABzQQJ0KAIAIAFBCHZzIQEgAkEBaiICIABJDQALIAFBf3O4Cw";
var instance = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(atob(wasm), function (c) { return c.charCodeAt(0); })));
var _a = instance.exports, c = _a.c, m = _a.m;
// Someday we'll have BYOB stream readers and encodeInto etc.
// When that happens, we should write into this buffer directly.
var pageSize = 0x10000; // 64 kB
var crcBuffer = makeUint8Array(m).subarray(pageSize);
function crc32(data, crc) {
    if (crc === void 0) { crc = 0; }
    while (data.length > pageSize) {
        crcBuffer.set(data.subarray(0, pageSize));
        crc = c(pageSize, crc);
        data = data.subarray(pageSize);
    }
    if (data.length) {
        crcBuffer.set(data);
        crc = c(data.length, crc);
    }
    return crc;
}

var ZipConst;
(function (ZipConst) {
    ZipConst[ZipConst["fileHeaderSignature"] = 1347093252] = "fileHeaderSignature";
    ZipConst[ZipConst["descriptorSignature"] = 1347094280] = "descriptorSignature";
    ZipConst[ZipConst["centralHeaderSignature"] = 1347092738] = "centralHeaderSignature";
    ZipConst[ZipConst["endSignature"] = 1347093766] = "endSignature";
    ZipConst[ZipConst["fileHeaderLength"] = 30] = "fileHeaderLength";
    ZipConst[ZipConst["centralHeaderLength"] = 46] = "centralHeaderLength";
    ZipConst[ZipConst["endLength"] = 22] = "endLength";
    ZipConst[ZipConst["descriptorLength"] = 16] = "descriptorLength";
})(ZipConst || (ZipConst = {}));
function fileHeader(encodedname, size, modDate, crc) {
    var header = makeBuffer(ZipConst.fileHeaderLength);
    header.setUint32(0, ZipConst.fileHeaderSignature);
    header.setUint32(4, 167772168); //enable utf8 https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
    //only support STORE mode
    formatDOSDateTime(modDate || new Date(), header, 10);
    header.setUint32(14, crc, true);
    header.setUint32(18, size, true);
    header.setUint32(22, size, true);
    header.setUint16(26, encodedname.length, true);
    return makeUint8Array(header);
}
function centralHeader(encodedname, size, modDate, crc, offset) {
    var header = makeBuffer(ZipConst.centralHeaderLength);
    header.setUint32(0, ZipConst.centralHeaderSignature);
    header.setUint32(4, 0x14000a00);
    //enable utf8
    header.setUint16(8, 0x0008); //
    formatDOSDateTime(modDate, header, 12);
    header.setUint32(16, crc, true);
    header.setUint32(20, clampInt32(size), true);
    header.setUint32(24, clampInt32(size), true);
    header.setUint16(28, encodedname.length, true);
    header.setUint16(30, 0, true);
    // useless disk fields = zero (4 bytes)
    // useless attributes = zero (4 bytes)
    header.setUint16(40, 0); //no permission
    header.setUint32(42, clampInt32(offset), true); // offset
    return makeUint8Array(header);
}
/*
export function dataDescriptor(size:number,crc:number) {
  const header = makeBuffer(ZipConst.descriptorLength );
  header.setUint32(0, ZipConst.descriptorSignature)
  header.setUint32(4, crc, true)
  header.setUint32(8, clampInt32(size), true)
  header.setUint32(12, clampInt32(size), true)
  return makeUint8Array(header)
}
*/

/*
   No Async, No comment, no disk/network io, no compression, no crc checking, 32bits only.
   No Checking of local file header
   allow lazy loading of file content.
   Silent if not a zip
*/
var ZipStore = /** @class */ (function () {
    function ZipStore(zipbuf) {
        //may pass in nodejs readFile result
        if (zipbuf instanceof ArrayBuffer) {
            zipbuf = new Uint8Array(zipbuf);
        }
        this.zipbuf = (zipbuf instanceof Uint8Array) ? zipbuf : new Uint8Array(zipbuf.buffer);
        this.files = [];
        this.zipStart = 0; //begining first file including header (PK)
        var _a = this.loadEndRecord(), fileCount = _a.fileCount, centralSize = _a.centralSize, centralOffset = _a.centralOffset;
        if (fileCount) {
            this.loadFiles(fileCount, centralSize, centralOffset);
        }
    }
    ZipStore.prototype.loadFiles = function (fileCount, centralSize, centralOffset) {
        //calculate centraloffset from end of buffer , 
        //an partial zip buf is smaller than value specified in endRecord
        var coffset = this.zipbuf.length - ZipConst.endLength - centralSize;
        // const centralbuf=new DataView(this.zipbuf.slice(coffset,coffset+centralSize).buffer);
        var buf = new DataView(this.zipbuf.buffer);
        var p = coffset;
        for (var i = 0; i < fileCount; i++) {
            var signature = buf.getUint32(p);
            if (signature !== ZipConst.centralHeaderSignature) {
                //throw "wrong central header signature"
                break;
            }
            var size = buf.getUint32(p + 20, true);
            var namelen = buf.getUint16(p + 28, true);
            var extra = buf.getUint16(p + 30, true);
            var commentlen = buf.getUint16(p + 32, true);
            var offset = buf.getUint32(p + 42, true);
            p += ZipConst.centralHeaderLength;
            var encodedName = this.zipbuf.subarray(p, p + namelen);
            var name_1 = new TextDecoder().decode(encodedName);
            p += namelen;
            p += extra + commentlen;
            if (i === 0)
                this.zipStart = offset; //before zipstart is RedBean 
            offset += ZipConst.fileHeaderLength + namelen; //skip the local file header
            var content = void 0;
            var inbuf = centralOffset - coffset;
            if (offset - inbuf >= 0) {
                content = this.zipbuf.subarray(offset - inbuf, offset - inbuf + size);
            } // else host will do lazy loading
            this.files.push({ name: name_1, offset: offset, size: size, content: content }); //offset and size of actual data in the zip image
        }
    };
    ZipStore.prototype.find = function (name) {
        for (var i = 0; i < this.files.length; i++) {
            if (this.files[i].name == name) {
                return this.files[i];
            }
        }
    };
    ZipStore.prototype.loadEndRecord = function () {
        var endRecord = { signature: 0, fileCount: 0, centralSize: 0, centralOffset: 0 };
        //cannot use subarray here
        var buf = new DataView(this.zipbuf.buffer); //this.zipbuf.slice(this.zipbuf.length-ZipConst.endLength).buffer);
        // console.log(endbuf)
        var endpos = this.zipbuf.length - ZipConst.endLength;
        endRecord.signature = buf.getUint32(endpos);
        if (endRecord.signature !== ZipConst.endSignature) {
            console.log('endrecord signature', endRecord.signature, 'zipbuf length', this.zipbuf.length);
            throw "wrong endRecord signature";
        }
        endRecord.fileCount = buf.getUint16(endpos + 8, true);
        endRecord.centralSize = buf.getUint32(endpos + 12, true);
        endRecord.centralOffset = buf.getUint32(endpos + 16, true);
        return endRecord;
    };
    return ZipStore;
}());

//based on  https://github.com/Touffy/client-zip but only support sync mode
var MAX_FILENAME = 256;
var storeZip = function (inputs, opts) {
    if (opts === void 0) { opts = {}; }
    var estimatesize = 0;
    for (var i = 0; i < inputs.length; i++) {
        var len = inputs[i].content.length;
        estimatesize += len + ZipConst.fileHeaderLength + MAX_FILENAME;
    }
    estimatesize += (ZipConst.centralHeaderLength + MAX_FILENAME) * inputs.length + ZipConst.endLength;
    var datenow = new Date();
    var offset = opts.reserve || 0, centralSize = 0;
    var zipbuf = new Uint8Array(offset + estimatesize);
    var centralRecords = [];
    for (var i = 0; i < inputs.length; i++) {
        var _a = inputs[i], name_1 = _a.name, date = _a.date, content = _a.content;
        var contentarr = (typeof content == 'string') ? Buffer.from(content, 'utf-8') : content;
        var encodedname = encodeString(name_1);
        var crc = crc32(contentarr);
        var fileoffset = offset;
        var header = fileHeader(encodedname, contentarr.length, date || datenow, crc);
        zipbuf.set(header, offset);
        offset += header.length;
        zipbuf.set(encodedname, offset);
        offset += encodedname.length;
        zipbuf.set(contentarr, offset);
        offset += contentarr.length;
        var rec = centralHeader(encodedname, contentarr.length, date || datenow, crc, fileoffset);
        centralRecords.push(rec);
        centralRecords.push(encodedname);
        centralSize += rec.length + encodedname.length;
    }
    var centralOffset = offset;
    for (var _i = 0, centralRecords_1 = centralRecords; _i < centralRecords_1.length; _i++) {
        var record = centralRecords_1[_i];
        zipbuf.set(record, offset);
        offset += record.length;
    }
    //no comment
    var end = makeBuffer(ZipConst.endLength);
    end.setUint32(0, ZipConst.endSignature);
    // skip 4 useless bytes here
    end.setUint16(8, clampInt16(inputs.length), true);
    end.setUint16(10, clampInt16(inputs.length), true);
    end.setUint32(12, clampInt32(centralSize), true);
    end.setUint32(16, clampInt32(centralOffset), true);
    var endarr = makeUint8Array(end);
    zipbuf.set(endarr, offset);
    offset += endarr.length;
    return zipbuf.subarray(0, offset); // avoid create new copy
};

var readBlob = function (file, zipbuf, fileoffset, end, bufferoffset) { return __awaiter(void 0, void 0, void 0, function () {
    var blob, buf, arr;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                blob = file.slice(fileoffset, end);
                return [4 /*yield*/, blob.arrayBuffer()];
            case 1:
                buf = _a.sent();
                arr = new Uint8Array(buf);
                if (typeof bufferoffset == 'undefined')
                    bufferoffset = fileoffset;
                zipbuf.set(arr, bufferoffset);
                return [2 /*return*/, true];
        }
    });
}); };
var fetchBuf = function (url, zipbuf, fileoffset, end, bufferoffset) { return __awaiter(void 0, void 0, void 0, function () {
    var res, lastpart, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!(url.name && url.size)) return [3 /*break*/, 2];
                return [4 /*yield*/, readBlob(url, zipbuf, fileoffset, end, bufferoffset)];
            case 1: //a user provide file handle
            return [2 /*return*/, _b.sent()];
            case 2: return [4 /*yield*/, fetch(url, { headers: {
                        'content-type': 'multipart/byteranges',
                        'range': 'bytes=' + fileoffset + '-' + end,
                    } })];
            case 3:
                res = _b.sent();
                if (typeof bufferoffset == 'undefined')
                    bufferoffset = fileoffset;
                if (!res.ok) return [3 /*break*/, 5];
                _a = Uint8Array.bind;
                return [4 /*yield*/, res.arrayBuffer()];
            case 4:
                lastpart = new (_a.apply(Uint8Array, [void 0, _b.sent()]))();
                zipbuf.set(lastpart, bufferoffset);
                return [2 /*return*/, true];
            case 5: return [2 /*return*/, false];
        }
    });
}); };
var RemoteZipStore = /** @class */ (function () {
    function RemoteZipStore() {
        this.zipstore = null;
        this.url = '';
        this.filenames = {}; //access via name
        this.files; //from zipstore, access via array index
    }
    RemoteZipStore.prototype.content = function (name_idx) {
        var fileinfo = (typeof name_idx == 'string') ? this.filenames[name_idx] : this.files[name_idx];
        if (!fileinfo)
            return null;
        return fileinfo.content;
    };
    RemoteZipStore.prototype.load = function (files_1) {
        return __awaiter(this, arguments, void 0, function (files, binary) {
            var jobs, i;
            if (binary === void 0) { binary = false; }
            return __generator(this, function (_a) {
                if (typeof files == 'string')
                    files = [files];
                jobs = [];
                for (i = 0; i < files.length; i++) {
                    jobs.push(this.fetchFile(files[i], binary));
                }
                return [2 /*return*/, Promise.all(jobs)];
            });
        });
    };
    RemoteZipStore.prototype.fetchFile = function (name_idx_1) {
        return __awaiter(this, arguments, void 0, function (name_idx, binary) {
            var fileinfo, offset, size, buf, ok;
            if (binary === void 0) { binary = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fileinfo = (typeof name_idx == 'string') ? this.filenames[name_idx] : this.files[name_idx];
                        if (!fileinfo)
                            return [2 /*return*/, null];
                        if (!(typeof fileinfo.content !== 'undefined')) return [3 /*break*/, 1];
                        if (!binary && typeof fileinfo.content !== 'string') {
                            fileinfo.content = new TextDecoder().decode(fileinfo.content);
                        }
                        return [2 /*return*/, fileinfo.content];
                    case 1:
                        offset = fileinfo.offset, size = fileinfo.size;
                        buf = new Uint8Array(size);
                        return [4 /*yield*/, fetchBuf(this.url, buf, offset, offset + size - 1, 0)];
                    case 2:
                        ok = _a.sent();
                        if (ok) {
                            fileinfo.content = binary ? buf : new TextDecoder().decode(buf);
                            return [2 /*return*/, fileinfo.content];
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    RemoteZipStore.prototype.open = function (url_1) {
        return __awaiter(this, arguments, void 0, function (url, opts) {
            var headbuf, dv, ok, full, filesize, res, bufsize, zipbuf, i;
            if (opts === void 0) { opts = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.url = url;
                        headbuf = new Uint8Array(16);
                        dv = new DataView(headbuf.buffer);
                        return [4 /*yield*/, fetchBuf(url, headbuf, 0, 15)];
                    case 1:
                        ok = _a.sent();
                        full = opts.full;
                        if (!ok)
                            return [2 /*return*/, null];
                        if ((headbuf[0] !== 0x50 || headbuf[1] !== 0x4B) //normal zip
                            && (headbuf[0] !== 0x4D || headbuf[1] !== 0x5A)) { //MZ redbean
                            return [2 /*return*/, false];
                        }
                        if (!(headbuf[0] == 0x50 && headbuf[7] & 0x80)) return [3 /*break*/, 2];
                        //use TIME STAMP to store zip file size, normally local file headers are skipped.
                        //workaround for chrome-extension HEAD not returning content-length
                        filesize = dv.getUint32(0xA, true);
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, fetch(url, { method: 'HEAD' })];
                    case 3:
                        res = _a.sent();
                        filesize = parseInt(res.headers.get('Content-Length'));
                        _a.label = 4;
                    case 4:
                        if (isNaN(filesize))
                            return [2 /*return*/, false];
                        bufsize = full ? filesize : 1024 * 1024;
                        if (bufsize > filesize)
                            bufsize = filesize; // zip file smaller than 1MB
                        zipbuf = new Uint8Array(bufsize);
                        return [4 /*yield*/, fetchBuf(url, zipbuf, filesize - bufsize, filesize - 1, 0)];
                    case 5:
                        //fetch the central and end part of zip
                        if (!(_a.sent())) {
                            return [2 /*return*/];
                        }
                        this.zipstore = new ZipStore(zipbuf);
                        this.files = this.zipstore.files;
                        for (i = 0; i < this.files.length; i++) {
                            this.filenames[this.files[i].name] = this.files[i];
                        }
                        return [2 /*return*/, true];
                }
            });
        });
    };
    return RemoteZipStore;
}());

var openPtk = function (name_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([name_1], args_1, true), void 0, function (name, cachedimage) {
        var ptk, opts;
        if (cachedimage === void 0) { cachedimage = null; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ptk = usePtk(name);
                    if (ptk)
                        return [2 /*return*/, ptk];
                    if (!name)
                        return [2 /*return*/, null];
                    opts = { name: name };
                    if (cachedimage) {
                        opts["zipstore"] = new ZipStore(cachedimage);
                    }
                    ptk = new Pitaka(opts);
                    poolAdd(name, ptk); //add to pool for jsonp to work.
                    return [4 /*yield*/, ptk.isReady()];
                case 1:
                    if (!_a.sent()) return [3 /*break*/, 3];
                    return [4 /*yield*/, ptk.init()];
                case 2:
                    _a.sent();
                    /*
                    const poolptk=poolGetAll();
                    for (let i=0;i<poolptk.length;i++) {
                        poolptk[i].addForeignLinks(ptk);
                    }
                    */
                    return [2 /*return*/, ptk];
                case 3:
                    poolDel(name);
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
};
var openInMemoryPtk = function (name, ptkimage) { return __awaiter(void 0, void 0, void 0, function () {
    var zipstore, ptk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                zipstore = new ZipStore(ptkimage);
                ptk = new Pitaka({ name: name, zipstore: zipstore });
                if (!ptk.isReady()) return [3 /*break*/, 2];
                return [4 /*yield*/, ptk.init()];
            case 1:
                _a.sent();
                poolAdd(name, ptk);
                return [2 /*return*/, ptk];
            case 2: return [2 /*return*/];
        }
    });
}); };
var ptkFromString = function (name, contentString) {
    var ptk = new Pitaka({ name: name, contentString: contentString });
    ptk.init();
    poolAdd(name, ptk);
    return ptk;
};
var usePtk = function (name) {
    if (!name)
        return null;
    return poolGet(name);
};

var inMemory = function (lbaser) {
    if (!lbaser.name)
        lbaser.setName('inmemory');
    var ptk = new Pitaka({ inmemory: true });
    lbaser.dumpJs(function (fn, buf, page) { return ptk.setPage.apply(ptk, __spreadArray([page], parseJsonp(buf), false)); });
    poolAdd(lbaser.name, ptk);
    return ptk;
};

var move000js = function (sources) {
    var out = sources.filter(function (it) { return !it.name.endsWith('/000.js'); });
    var js000 = sources.filter(function (it) { return it.name.endsWith('/000.js'); });
    out.push.apply(out, js000);
    return out;
};
var makeInMemoryPtk = function (lbaser, css, comimage) {
    if (css === void 0) { css = ''; }
    if (comimage === void 0) { comimage = null; }
    var sources = Array(), locals = Array();
    var zip, redbeanbuf;
    lbaser.dumpJs(function (pagefn, buf) {
        sources.push({ name: lbaser.name + '/' + pagefn, content: new TextEncoder().encode(buf) });
    });
    if (css)
        sources.push({ name: lbaser.name + '/accelon22.css', content: new TextEncoder().encode(css) });
    if (comimage) { //copy all files from image, except the new ptk in lbase and config.js
        zip = new ZipStore(comimage);
        redbeanbuf = new Uint8Array(comimage.subarray(0, zip.zipStart || 0));
        for (var i = 0; i < zip.files.length; i++) {
            zip.files[i];
            // if (sources.indexOf(item.name)==-1 && item.name!=='config.js') {
            // 	sources.push(item);
            // }
        }
    }
    //find out all ptk
    sources.forEach(function (it) {
        if (it.name.endsWith('/000.js')) {
            var ptkname = it.name.slice(0, it.name.length - 7);
            locals.push(ptkname);
        }
    });
    //move 000.js close to central directory, better chance to be loaded when open
    sources = move000js(sources);
    //obsolete
    // sources.push({name:'config.js',
    // 	content:new TextEncoder().encode(`window.accelon22={locals:"`+locals.join(',')+'"}')});
    var newzipbuf = storeZip(sources, { reserve: (zip === null || zip === void 0 ? void 0 : zip.zipStart) || 0 });
    if (redbeanbuf)
        newzipbuf.set(redbeanbuf);
    else
        setPtkFileLength(newzipbuf);
    return newzipbuf;
};
//for chrome extension fetch to get the file size
var setPtkFileLength = function (buf) {
    buf[7] |= 0x80; //set the flag , so that we know it is a pitaka zip
    var sizebuf = new Uint32Array([buf.length]);
    var sizebuf8 = new Uint8Array(sizebuf.buffer);
    buf[10] = sizebuf8[0]; //Buffer.writeInt32LE(arr.length,0xA);
    buf[11] = sizebuf8[1];
    buf[12] = sizebuf8[2];
    buf[13] = sizebuf8[3];
};

//import { bsearchNumber ,parseOfftext,splitUTF32Char,CJKRangeName} from "../nodebundle.cjs";
var MAXFOLIOLINE = 8, MAXFOLIOCHAR = 32;
var VALIDPUNCS = "「」『』。，；：、！？";
var tidyFolioText = function (text) {
    //方括號的文字不算
    return text.replace(/【([^】]*)】/g, function (m, m1) { return '【' + '-'.repeat(m1.length) + '】'; });
};
var toFolioText = function (lines) {
    if (!lines || !lines.length)
        return [];
    var firstline = lines[0];
    firstline.match(/(\^pb\d+)/);
    var text = tidyFolioText(lines.join('\t'))
        //.replace(/\^folio#[a-z\d]+【([^】]+?)】/g,'')// 只作為 foliolist 的名字，查字典內文用不到
        .replace(/(..)\^pb/g, '$1^lb^pb') //replace in middle pb
        .split('^lb');
    // if (remain) text.push(remain);
    return text;
};
var countFolioChar = function (linetext) {
    var prev = 0, textsnip = '', count = 0;
    var consumeChar = function () {
        if (prev && textsnip[0] == '【') { //bracket follow a taginvisible to folio
            textsnip = textsnip.replace(/【([^】]*)】/, function (m, m1) { return '【' + '-'.repeat(m1.length) + '】'; });
        }
        var chars = splitUTF32Char(textsnip);
        var i = 0;
        while (i < chars.length) {
            var r = CJKRangeName(chars[i]);
            if (r || chars[i] == '　') {
                count++;
            }
            i++;
        }
    };
    linetext.replace(OFFTAG_REGEX_G, function (m4, rawName, rawAttrs, offset) {
        textsnip = linetext.slice(prev, offset);
        consumeChar();
        prev = offset + m4.length;
    });
    textsnip = linetext.slice(prev);
    consumeChar();
    return count;
};
var folioPosFromAddress = function (ptk, address) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, choff, lineoff, action, _b, start, end, folio, folioat, ckat, id, ck, ft, _c, pb, line, ch;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = parseAddress(address), choff = _a.choff, lineoff = _a.lineoff, action = _a.action;
                _b = ptk.rangeOfAddress(action), start = _b[0], end = _b[1];
                if (!end)
                    return [2 /*return*/, {}];
                folio = ptk.defines.folio;
                folioat = bsearchNumber(ptk.defines.folio.linepos, start + 1) - 1;
                if (folioat == -1)
                    folioat = 0;
                ckat = bsearchNumber(ptk.defines.ck.linepos, start + 1) - 1;
                id = folio.fields.id.values[folioat];
                if (!id)
                    return [2 /*return*/, {}];
                ck = ptk.defines.ck.fields.id.values[ckat];
                ft = new FolioText(ptk);
                return [4 /*yield*/, ft.load(id)];
            case 1:
                _d.sent();
                _c = ft.toFolioPos(ck, lineoff, choff), pb = _c[0], line = _c[1], ch = _c[2];
                return [2 /*return*/, { id: id, pb: pb, line: line, ch: ch }];
        }
    });
}); };
var FolioText = /** @class */ (function () {
    function FolioText(ptk) {
        this.ptk = ptk;
        this.offtext = '';
        this.pbs = [];
        this.pbpos = []; //pb 的起點，不算標記本身
        this.chunks = [];
        this.chunkpos = []; //chunk 的起點，不算標記本身
        this.chunklinepos = []; //chunk 所在行，從this.from 起算
        this.ck = ptk.defines.ck;
    }
    FolioText.prototype.toFolioPos = function (ck, lineoff, choff) {
        if (ck === void 0) { ck = '1'; }
        if (lineoff === void 0) { lineoff = 0; }
        if (choff === void 0) { choff = 0; }
        var _a = this.chunkRange(ck), ckstart = _a[0], ckend = _a[1];
        var str = this.offtext.slice(ckstart, ckend);
        var p = 0;
        while (lineoff > 0 && p < str.length) {
            if (str.charAt(p) == '\n')
                lineoff--;
            p++;
        }
        var start = ckstart + p + choff; // ckline 的起點 
        var pbat = bsearchNumber(this.pbpos, start + choff + 1) - 1;
        var _b = this.pbRange(this.pbs[pbat]), pbstart = _b[0], pbend = _b[1];
        var end = Math.min(start, pbend);
        var pbstr = this.offtext.slice(pbstart, end);
        if (this.offtext.slice(end, end + 3) == '^lb') {
            //if start is end of folioline, add one more lb to increase pblines.length
            //and ch will be zero
            //so that first folio char is markable 
            pbstr += '^lb';
        }
        var pblines = pbstr.split('^lb');
        var line = pblines.length;
        var ch = this.countFolioChar(pblines[pblines.length - 1]);
        return [this.pbs[pbat], line - 1, ch];
    };
    FolioText.prototype.folioPageText = function (pb) {
        var _a = this.pbRange(pb), start = _a[0], end = _a[1];
        return toFolioText(this.offtext.slice(start, end).split('\n'));
    };
    FolioText.prototype.countFolioChar = function (linetext) {
        return countFolioChar(linetext);
    };
    FolioText.prototype.skipFolioChar = function (linetext, ch) {
        if (!linetext)
            return 0;
        var prev = 0, textlen = 0, textsnip = '';
        var consumeChar = function () {
            if (prev && textsnip[0] == '【') { //bracket follow a taginvisible to folio
                textsnip = textsnip.replace(/【([^】]*)】/, function (m, m1) { return '【' + '-'.repeat(m1.length) + '】'; });
            }
            var chars = splitUTF32Char(textsnip);
            var i = 0;
            while (ch > -1 && i < chars.length) {
                var r = CJKRangeName(chars[i]);
                if (r || chars[i] == '　') {
                    ch--;
                }
                if (ch >= 0)
                    textlen += chars[i].codePointAt(0) >= 0x20000 ? 2 : 1;
                i++;
            }
        };
        var taglens = 0;
        linetext.replace(OFFTAG_REGEX_G, function (m4, rawName, rawAttrs, offset) {
            textsnip = linetext.slice(prev, offset);
            consumeChar();
            if (ch <= 0)
                return;
            prev = offset + m4.length;
            taglens += m4.length;
        });
        textsnip = linetext.slice(prev);
        consumeChar();
        return textlen + taglens;
    };
    FolioText.prototype.fromFolioPos = function (foliopos, line, ch) {
        var _a;
        if (line === void 0) { line = 0; }
        if (ch === void 0) { ch = 0; }
        var pbid = foliopos;
        if (typeof foliopos == 'object') {
            pbid = foliopos[0], line = foliopos[1], ch = foliopos[2];
        }
        var _b = this.pbRange(pbid), pbstart = _b[0], pbend = _b[1];
        var pbstr = tidyFolioText(this.offtext.slice(pbstart, pbend));
        var pblines = pbstr.split('^lb');
        var start = pbstart || 0;
        for (var i_1 = 0; i_1 < line; i_1++) {
            start += (((_a = pblines[i_1]) === null || _a === void 0 ? void 0 : _a.length) || 0) + (i_1 > 0 ? 3 : 0); //\n and "^lb".length after first line
        }
        var pbchoff = this.skipFolioChar(pbstr.slice(start - pbstart), ch); //與 pblinestart 的距離
        start += pbchoff;
        var ckat = bsearchNumber(this.chunkpos, start + 1) - 1;
        var ckid = this.chunks[ckat < 0 ? 0 : ckat];
        var _c = this.chunkRange(ckid), ckstart = _c[0], ckend = _c[1];
        var str = this.offtext.slice(ckstart, ckend);
        var cklines = str.split('\n');
        var p = ckstart || 0;
        var lineoff = 0, choff = 0, i = 0;
        for (i = 0; i < cklines.length; i++) {
            if (p + cklines[i].length >= start) {
                //從 ckline 起算的 距離(real ch offset)
                choff = start - p;
                break;
            }
            lineoff++;
            p += cklines[i].length + 1;
        }
        var ptkline = this.from + this.chunklinepos[ckat] + lineoff;
        var linecount = this.chunklinepos[ckat + 1] - this.chunklinepos[ckat];
        var at = bsearchNumber(this.ptk.defines.ck.linepos, ptkline + 1) - 1;
        var chunk = this.ptk.getChunk(at + 1);
        return { ckid: ckid, lineoff: lineoff, choff: choff, linetext: cklines[i] || '', ptkline: ptkline, linecount: linecount, at: at, ck: chunk };
    };
    FolioText.prototype.chunkRange = function (ckid) {
        var at = this.chunks.indexOf(ckid);
        if (at == -1)
            return [0, 0];
        return [this.chunkpos[at], this.chunkpos[at + 1]];
    };
    FolioText.prototype.chunkText = function (ckid) {
        var _a = this.chunkRange(ckid), s = _a[0], e = _a[1];
        return this.offtext.slice(s, e);
    };
    FolioText.prototype.pbRange = function (pb) {
        if (typeof pb == 'number')
            pb = pb.toString();
        var at = this.pbs.indexOf(pb);
        if (at == -1)
            return [0, 0];
        return [this.pbpos[at], this.pbpos[at + 1]];
    };
    FolioText.prototype.load = function (bkfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var ptk, bk, folio, from, to, addr, p, linecount, ch3, m, m;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        ptk = this.ptk;
                        bk = '', folio = bkfolio;
                        if (bkfolio.match(/\d$/)) {
                            bk = bkfolio.replace(/\d+$/g, '');
                        }
                        else {
                            folio = '';
                            bk = bkfolio;
                        }
                        addr = (bk ? ("bk#" + bk) : '') + (folio ? '.' : '') + (folio ? ('folio#' + folio) : '');
                        _a = ptk.rangeOfAddress(addr), from = _a[0], to = _a[1];
                        if (from == to) {
                            return [2 /*return*/, ['', from, to]];
                        }
                        return [4 /*yield*/, ptk.loadLines([from, to])];
                    case 1:
                        _b.sent();
                        this.folio = folio;
                        this.offtext = ptk.slice(from, to).join('\n');
                        this.from = from;
                        this.to = to;
                        p = 0, linecount = 0;
                        while (p < this.offtext.length) {
                            ch3 = this.offtext.slice(p, p + 3);
                            if (ch3 == '^pb') {
                                this.pbpos.push(p);
                                p += 3;
                                m = this.offtext.slice(p).match(/([\d]+)/);
                                this.pbs.push(m[1]);
                                p += m[1].length;
                            }
                            else if (ch3 == '^ck') {
                                this.chunkpos.push(p);
                                p += 3;
                                if (this.offtext.charAt(p) == '#')
                                    p++;
                                m = this.offtext.slice(p).match(/([a-z\d]+)/);
                                this.chunks.push(m[1]);
                                this.chunklinepos.push(linecount);
                                p += m[1].length;
                            }
                            else {
                                if (ch3[0] == '\n')
                                    linecount++;
                                p++;
                            }
                        }
                        this.pbpos.push(this.offtext.length - 1);
                        this.chunkpos.push(this.offtext.length - 1);
                        this.chunklinepos.push(linecount + 1);
                        return [2 /*return*/];
                }
            });
        });
    };
    return FolioText;
}());
var extractPuncPos = function (foliopagetext, foliolines, validpuncs) {
    if (foliolines === void 0) { foliolines = 5; }
    if (validpuncs === void 0) { validpuncs = VALIDPUNCS; }
    var puncs = [];
    for (var i = 0; i < foliopagetext.length; i++) {
        var ch = 0, ntag = 0, textsum = 0;
        var _a = parseOfftext(foliopagetext[i]), text = _a[0], tags = _a[1];
        var isgatha = !!tags.filter(function (it) { return it.name == 'gatha'; }).length;
        if (i >= foliolines)
            break;
        if (isgatha) {
            text = text.replace(/[？；，。．]/g, '　');
        }
        var chars = splitUTF32Char(text);
        for (var j = 0; j < chars.length; j++) {
            while (ntag < tags.length && textsum > tags[ntag].choff) {
                if (tags[ntag].name == 'ck') {
                    puncs.push({ line: i, ch: ch, text: styledNumber(parseInt(tags[ntag].attrs.id), '①') });
                }
                else if (tags[ntag].name == 'n') { //sutta number
                    puncs.push({ line: i, ch: ch, text: 'n' + parseInt(tags[ntag].attrs.id) });
                }
                ntag++;
            }
            textsum += chars[j].length;
            if (~validpuncs.indexOf(chars[j])) {
                var text_1 = toVerticalPunc(chars[j]);
                puncs.push({ line: i, ch: ch, text: text_1 });
            }
            var r = CJKRangeName(chars[j]);
            if (r || chars[j] == '　') {
                ch++;
            }
        }
    }
    return puncs;
};

/*  discard, 只能從 pgd 轉 ptk ，先不考慮從 ptk 轉pgd
export const pagedGroupFromPtk=(ptk,pageds:PagedGroup)=>{
    pageds=pageds||new PagedGroup();
    const {sectiontypes,sectionnames,sectionstarts}=ptk.header;
    const pdg={};
    for (let i=1;i<sectiontypes.length;i++) {
        const stype=sectiontypes[i];
        if (stype!=='txt' && stype!=='tsv') continue;
        const from=sectionstarts[i]
        const to=sectionstarts[i+1];
        const content=ptk.slice(from,to);
        //conbine offtext and tsv into single file
        const name=sectionnames[i].replace('.off','').replace('.tsv','')
        if (!pdg[name]) pdg[name]=[];
        if (stype=='tsv') {
            const col=new Column();
            col.deserialize(content);
            const tsv=col.toTSV().replace(/\^p /g,'\n');
            pdg[name]=pdg[name].concat(tsv);
        } else {
            //convert ck back to tab, see dumpOffTsv
            const newcontent=content.map(it=>it.replace(/\^ck\d+ /g,'\t'));
            pdg[name]=pdg[name].concat(newcontent);
        }
    }
    for (let name in pdg) {
        pageds.add(name,pdg[name].join('\n'));
    }
    return pageds
}
*/
var PtkFromPagedGroup = function (sources_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([sources_1], args_1, true), void 0, function (sources, img, escape) {
        var compiler, i, fn, prolog, lbaser, ptkimage;
        if (img === void 0) { img = false; }
        if (escape === void 0) { escape = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    compiler = new Compiler;
                    for (i = 0; i < sources.length; i++) {
                        fn = sources[i].name.replace(/\.[^.]*$/g, '');
                        sources[i].header;
                        if (fn == '0')
                            continue;
                        prolog = '';
                        if (~sources[i].name.indexOf(".tsv")) {
                            if (!sources[i].text.startsWith('^:')) {
                                prolog = "^:<name=" + fn + " preload=true >\tval\n";
                            }
                        }
                        sources[i].text = prolog + sources[i].text;
                    }
                    return [4 /*yield*/, makeLineBaser(sources, compiler)];
                case 1:
                    lbaser = _a.sent();
                    if (img) {
                        ptkimage = makeInMemoryPtk(lbaser);
                        return [2 /*return*/, ptkimage];
                    }
                    else {
                        return [2 /*return*/, lbaser.asString(escape)];
                    }
            }
        });
    });
};

var buildYToc = function (ptk, book) {
    var Y = ptk === null || ptk === void 0 ? void 0 : ptk.defines.y;
    if (!Y)
        return [];
    var ID = Y.fields.id;
    var out = [];
    var _a = ptk.rangeOfAddress('bk#' + book), from = _a[0], to = _a[1];
    var DK = ptk.defines.dk;
    for (var i = 0; i < ID.values.length; i++) {
        var linepos = Y.linepos[i];
        if (linepos < from || linepos > to)
            continue;
        var at = ptk.nearestTag(linepos + 1, 'dk');
        var page = parseInt(DK.fields.id.values[at]);
        var line = linepos - DK.linepos[at];
        var t = Y.getInnertext(i) || captionOfPage(ptk, book, page, line);
        var caption = '^y' + ID.values[i] + '《' + t + '》';
        out.push({ caption: caption, page: page, line: line });
    }
    return out;
};
var captionOf = function (ptk, addr) {
    if (!addr)
        return '';
    var _a = parsePageBookLine(addr), p = _a[0], b = _a[1], l = _a[2];
    return captionOfPage(ptk, b, p, l);
};
var captionOfPage = function (ptk, bk, page, line, bookname) {
    if (line === void 0) { line = 0; }
    if (bookname === void 0) { bookname = false; }
    if (!ptk)
        return '';
    var COL = ptk.columns[bk];
    var caption = '';
    if (COL && parseInt(page).toString() == page) {
        var at = COL.dkat.indexOf(parseInt(page));
        caption = COL.keys.get(at) || '';
    }
    if (!caption) { //try yid
        var _a = ptk.rangeOfAddress('bk#' + bk + '.dk#' + page), s = _a[0]; _a[1];
        var tagat = ptk.nearestTag(s + 1 + parseInt(line), 'y');
        if (~tagat) {
            while (tagat >= 0 && !caption) {
                caption = ptk.defines.y.getInnertext(tagat);
                tagat--;
            }
        }
    }
    return (bookname ? (ptk.BookNameById[bk] + '．') : '') + caption;
};
var pageBookLineOfAnchor = function (anchor, ptk, bk) {
    var _a = anchor.split('@'), xyidline = _a[0], book = _a[1];
    book = book || bk;
    var _b = xyidline.split('.'), xyid = _b[0], loff = _b[1];
    loff = parseInt(loff) || 0;
    var bookstart = ptk.rangeOfAddress('bk#' + book)[0];
    var _c = ptk.rangeOfAddress('bk#' + book + '.y#' + xyid.slice(1)), s = _c[0]; _c[1];
    var bookat = ptk.nearestTag(bookstart + 1, "dk");
    if (bookat < 0)
        bookat = 0;
    var numberpage = ptk.nearestTag(s + 1, "dk") - bookat;
    var lineoff = s - ptk.defines.dk.linepos[numberpage] + loff;
    return numberpage + '@' + book + (lineoff ? '.' + lineoff : '');
};
var yidarrInRange = function (ptk, s, e) {
    var _a, _b;
    var _c = ptk.tagInRange("y", s, e), first = _c[0], last = _c[1];
    var idarr = (_a = ptk.defines.y) === null || _a === void 0 ? void 0 : _a.fields.id.values;
    var linepos = (_b = ptk.defines.y) === null || _b === void 0 ? void 0 : _b.linepos;
    var out = [];
    if (!idarr || !linepos)
        return [];
    for (var i = first; i <= last; i++) {
        out[linepos[i] - s] = "y" + idarr[i];
    }
    var prev = '', lineoff = 0;
    for (var i = 0; i < e - s; i++) { //
        if (out[i]) {
            prev = out[i];
            lineoff = 0;
        }
        else if (prev) {
            lineoff++;
            out[i] = prev + '.' + lineoff;
        }
    }
    return out;
};
var enumEntries = function (ptk, fn, tofind, max) {
    var _a;
    if (max === void 0) { max = 100; }
    var keys = (_a = ptk.columns[fn]) === null || _a === void 0 ? void 0 : _a.keys;
    if (!keys)
        return [];
    var tf = tofind, mode = SA_MATCH_ANY;
    if (tofind.startsWith('^')) {
        tf = tofind.slice(1);
        mode = SA_MATCH_START;
    }
    else if (tofind.endsWith('$')) {
        tf = tofind.slice(0, tofind.length - 1);
        mode = SA_MATCH_END;
    }
    else if (tofind.startsWith('.') && tofind.endsWith('.')) {
        tf = tofind.slice(1, tofind.length - 1);
        mode = SA_MATCH_MIDDLE;
    }
    if (!tf) {
        var atarr = keys.enumMode(tf, mode, max);
        return atarr.map(function (it) { return keys.get(it); });
    }
    else {
        for (var i = 0; i < max; i++) {
            var t = keys.get(i);
            if (!t)
                break;
            out.push(t);
        }
        return out;
    }
};
var getBookColumnText = function (ptk, bk, key) {
    var col = ptk.columns[bk];
    if (!col || !col.keys)
        return [-1, ''];
    var at = col.keys.indexOf(key);
    if (at == -1)
        return [-1, ''];
    var dk = col.dkat[at];
    var _a = ptk.rangeOfAddress('bk#' + bk + '.dk#' + dk), s = _a[0], e = _a[1];
    return [dk, ptk.slice(s, e).join('\n'), bk];
};
var getAnyColumnText = function (ptk, book, key) {
    var _a;
    if (!key)
        return [-1, ''];
    if (book) {
        return getBookColumnText(ptk, book, key);
    }
    else {
        var at = void 0, text = void 0;
        for (var _i = 0, _b = Object.keys(ptk.columns); _i < _b.length; _i++) {
            var bk = _b[_i];
            _a = getBookColumnText(ptk, bk, key), at = _a[0], text = _a[1];
            if (at > -1)
                return [at, text, bk];
        }
        return [-1, ''];
    }
};
var TRANSCLUSION_INDIRECT_REGEX = /@(.+)$/;
var getColumnText = function (ptk, bk, key) {
    var _a;
    var _b = getAnyColumnText(ptk, bk, key), at = _b[0], content = _b[1]; _b[2];
    //book may overwrite bk if empty
    var m = content.match(TRANSCLUSION_INDIRECT_REGEX);
    while (m) {
        content = '';
        key = m[1];
        if (m) {
            _a = getAnyColumnText(ptk, bk, m[1]), at = _a[0], content = _a[1];
        }
        else
            break;
        m = content.match(/@([^ <>\[\]\{\}]+)$/);
    }
    return [content, [{ key: key }], at, 0];
};
var columnTextByKey = function (ptk, key, bk) {
    if (bk === void 0) { bk = ''; }
    return getColumnText(ptk, bk, key);
};
var pageFromPtk = function (ptk, book, page) {
    var _a = ptk.rangeOfAddress("bk#" + book + ".dk#" + page), s = _a[0], e = _a[1];
    //assuming inmemory
    //await ptk.loadLines([s,e]);
    var lineinfo = [];
    var yidarr = [];
    if (ptk.defines.y) {
        yidarr = yidarrInRange(ptk, s, e);
    }
    var lines = ptk.slice(s, e);
    var text = lines.join('\n');
    var locallinks = (ptk.LocalBackLinks && ptk.LocalBackLinks[book]) || [];
    for (var i = 0; i < e - s; i++) {
        lineinfo[i] = { yid: yidarr[i], locallinks: locallinks[s + i] };
    }
    return [text, lineinfo, page, s];
};
var getSliceText = function (bk, pg, ptk, getPageText) {
    if (parseInt(pg).toString() == pg) {
        return ptk ? pageFromPtk(ptk, bk, pg) : getPageText(pg, bk);
    }
    else if (ptk) {
        if (pg.startsWith('x') || pg.startsWith('y')) {
            var _a = parsePageBookLine(pg), page = _a[0]; _a[1]; _a[2];
            var _b = ptk.rangeOfAddress('bk#' + bk + '.y#' + page.slice(1)), s = _b[0], e = _b[1];
            var lines = ptk.slice(s, e);
            var yidarr = yidarrInRange(ptk, s, e);
            var numberpage = ptk.nearestTag(s + 1, "dk");
            var lineoff = s - ptk.defines.dk.linepos[numberpage];
            var lineinfo = [];
            var book = ptk.nearestTag(s + 1, 'bk', 'id');
            var locallinks = (ptk.LocalBackLinks && ptk.LocalBackLinks[book]) || [];
            for (var i = 0; i < lines.length; i++) {
                lineinfo[i] = { yid: yidarr[i], locallinks: locallinks[s + i] };
            }
            return [lines.join('\n'), lineinfo, numberpage, lineoff];
        }
        else {
            return columnTextByKey(ptk, pg, bk);
        }
    }
    return ['', [], 0, 0];
};
var brokenTransclusions = function (ptk, dictptk) { return __awaiter(void 0, void 0, void 0, function () {
    var notfound, i, line, units, j, u, _a, innertext, _b, t, obj, key, notfoundarr;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (!ptk)
                    return [2 /*return*/, []];
                return [4 /*yield*/, ptk.loadAll()];
            case 1:
                _c.sent();
                notfound = {};
                if (!dictptk)
                    dictptk = ptk;
                for (i = 1; i < ptk.header.eot; i++) {
                    line = ptk.getLine(i);
                    units = unitize(line);
                    for (j = 0; j < units.length; j++) {
                        u = units[j];
                        if (u.startsWith('^[')) {
                            _a = parseTransclusion(u), _a[0], innertext = _a[1];
                            _b = columnTextByKey(dictptk, innertext), t = _b[0], obj = _b[1];
                            if (!t) {
                                key = obj[0].key || innertext;
                                if (!notfound[key])
                                    notfound[key] = 0;
                                notfound[key]++;
                            }
                        }
                    }
                }
                notfoundarr = fromObj(notfound, true);
                if (notfoundarr.length)
                    console.log(notfoundarr);
                return [2 /*return*/, []];
        }
    });
}); };
//return term key given entry,  
function keyOfEntry(entry) {
    var _a;
    var _b = getAnyColumnText(this, '', entry); _b[0]; var text = _b[1];
    var key = entry, m;
    while (m = text.match(TRANSCLUSION_INDIRECT_REGEX)) {
        key = m[1];
        _a = getAnyColumnText(this, '', key), _a[0], text = _a[1];
    }
    return key;
}
var entriesOfKey = function (ptk, key, firstonly) {
    if (firstonly === void 0) { firstonly = false; }
    var out = [];
    for (var _i = 0, _a = Object.keys(ptk.columns); _i < _a.length; _i++) {
        var bk = _a[_i];
        var col = ptk.columns[bk];
        if (!col.dkat)
            continue;
        for (var j = 0; j < col.dkat.length; j++) {
            var _b = ptk.rangeOfAddress("bk#" + bk + ".dk#" + col.dkat[j]), s = _b[0], e = _b[1];
            var text = ptk.slice(s, e).join('\n');
            if (text.endsWith('@' + key)) {
                out.push(col.keys.get(j));
            }
        }
    }
    if (out.length == 0) { //沒有中文名
        return key;
    }
    else
        return firstonly ? (out[0] || '') : out;
};

function columnField(name, field, idx) {
    var column = this.columns[name];
    var at = column.fieldnames.indexOf(field);
    return column.fieldvalues[at][idx];
}
function inlineNote(tagname, noteid) {
    return __awaiter(this, void 0, void 0, function () {
        var typedef, col, at, textfield, at2, values;
        return __generator(this, function (_a) {
            typedef = this.defines[tagname];
            col = this.columns[typedef.fields.type.foreign];
            if (!col)
                return [2 /*return*/];
            at = col.findKey(noteid);
            textfield = typedef.attrs.text;
            at2 = col.fieldnames.indexOf(textfield);
            values = col.fieldvalues[at2];
            return [2 /*return*/, (values && values[at]) || ''];
        });
    });
}
function rowOf(rowname, idx, field) {
    if (field === void 0) { field = -1; }
    var column = this.columns[rowname];
    if (typeof field == 'string') {
        field = column.fieldnames.indexOf(field);
    }
    var out = [];
    if (field > 0) {
        out.push({ name: name, typedef: column.fieldsdef[field], value: column.fieldvalues[field][idx] });
    }
    else {
        for (var i = 0; i < column.fieldnames.length; i++) {
            var name_1 = column.fieldnames[i];
            out.push({ name: name_1, typedef: column.fieldsdef[i], value: column.fieldvalues[i][idx] });
        }
    }
    return out;
}
var getCacheKey = function (name, field, tofind) {
    return name + ':' + field + '=' + tofind;
};
function searchColumnField(name, field, tofind) {
    var simtofind = fromSim(tofind);
    var cachekey = getCacheKey(name, field, tofind);
    var cache = this.scanCache[cachekey];
    if (!cache && simtofind !== tofind) {
        cache = this.scanCache[getCacheKey(name, field, simtofind)];
    }
    if (!cache) {
        var array = this.columns[name][field];
        if (!array) {
            console.log('missing field', field, 'in column', name);
            return null;
        }
        var contain = indexOfs(array, tofind);
        if (!contain.length && simtofind !== tofind) {
            contain = indexOfs(array, simtofind);
            if (contain.length) {
                cachekey = getCacheKey(name, field, simtofind);
            }
        }
        var caption = this.columns[name].caption || name;
        cache = { name: name, field: field, caption: caption, contain: contain };
        this.scanCache[cachekey] = cache;
    }
    return cache;
}
function scanColumnFields(tofind) {
    var out = [];
    if (!tofind)
        return [];
    for (var name_2 in this.columns) {
        if (!this.columns[name_2].attrs.scan)
            continue;
        var scans = this.columns[name_2].attrs.scan.split(",");
        for (var i = 0; i < scans.length; i++) {
            var cache = searchColumnField.call(this, name_2, scans[i], tofind);
            out.push(cache);
        }
    }
    for (var name_3 in this.primarykeys) {
        if (!this.columns[name_3].attrs.bme)
            continue;
        var cachekey = name_3 + '=' + tofind;
        var cache = this.scanCache[cachekey];
        if (!cache) {
            var sa = this.primarykeys[name_3];
            var start = sa.enumStart(tofind);
            var middle = sa.enumMiddle(tofind);
            var end = sa.enumEnd(tofind);
            var caption = this.columns[name_3].caption || name_3;
            cache = { name: name_3, caption: caption, start: start, middle: middle, end: end };
            this.scanCache[cachekey] = cache;
        }
        out.push(cache);
    }
    return out;
}

function findFootmarkInBook(ptk, id, line) {
    var ck = ptk.nearestChunk(line);
    var fntag = ptk.defines.fn;
    var closestfn = ptk.findClosestTag(fntag, 'id', id, line);
    if (~closestfn) {
        return ptk.name + ':bk#' + ck.bk.id + '.fm' + id;
    }
}
function footNoteAddress(id, line) {
    var ptk = this;
    //先找同頁注
    var fnaddr = findFootmarkInBook(ptk, id, line);
    if (fnaddr)
        return fnaddr;
    //異頁注
    var ck = ptk.nearestChunk(line);
    var chunktag = ptk.defines.ck;
    var bktag = ptk.defines.bk;
    var footbk = 'fn_' + ck.bkid;
    var at = bktag.fields.id.values.indexOf(footbk);
    if (at == -1)
        return ptk.name + ':' + ck.bk.id + '.fm' + id;
    var booknotebkline = bktag.linepos[at];
    var closestchunk = ptk.findClosestTag(chunktag, 'id', ck.id, booknotebkline);
    var chunk = chunktag.fields.id.values[closestchunk];
    var address = ptk.name + ':' + footbk + '.' +
        'ck' + (parseInt(chunk) ? chunk : '#' + chunk)
        + '.fn' + id;
    return address;
}
function footNoteInTSV(id, line) {
    var ptk = this;
    var ck = '', hasck = false;
    if (!id)
        return '';
    if (id && ~id.indexOf('.')) { //given a chunk
        ck = ptk.getChunk(id.slice(0, id.indexOf('.')));
        hasck = true;
    }
    else {
        ck = ptk.nearestChunk(line);
    }
    if (!ck)
        return '';
    var bkid = ck.bkid + "-note"; //優先
    var footnotecol = ptk.columns[bkid];
    if (!footnotecol) {
        bkid = ck.bkid;
        footnotecol = ptk.columns[bkid]; //each tsv has one book
    }
    if (!footnotecol)
        return '--no note--';
    if (footnotecol.attrs.footnote == 'ck' && !hasck) {
        id = ck.id + '.' + id;
    }
    var o = footnotecol.fieldByKey(id, "note") || '';
    if (!o) { //try dkat
        var key = ck.id + '.' + id;
        var r = getBookColumnText(ptk, bkid, key);
        o = r[1];
    }
    return o;
}
function footNoteByAddress(id, line) {
    var ptk = this;
    var ck = ptk.nearestChunk(line);
    var chunktag = ptk.defines.ck;
    var bktag = ptk.defines.ck;
    var footnotetag = ptk.defines.f;
    var footbk = ck.bkid.replace('_fn', '');
    var at = bktag.fields.id.values.indexOf(footbk);
    if (at == 0)
        footbk = '';
    else
        footbk += '.'; //not needed to specified chunk    
    var booknotebkline = bktag.linepos[at];
    var closestchunk = ptk.findClosestTag(chunktag, 'id', ck.id, booknotebkline);
    var chunk = chunktag.fields.id.values[closestchunk];
    var footnoteat = ptk.findClosestTag(footnotetag, 'id', parseInt(id), chunktag.linepos[closestchunk]);
    var footnoteline = footnotetag.linepos[footnoteat];
    var highlightline = footnoteline - chunktag.linepos[closestchunk];
    var address = footbk + 'ck' + chunk + (highlightline ? ":" + highlightline : '');
    return address;
}

var bookPrefix = function (bookname) {
    var prefix = bookname;
    var at = bookname.lastIndexOf('_');
    if (~at)
        prefix = bookname.slice(0, at);
    return prefix;
};
function getParallelLine(sourceptk, line, remote) {
    if (remote === void 0) { remote = false; }
    var chunk = sourceptk.nearestChunk(line + 1);
    if (!chunk)
        return [];
    var bk = this.defines.bk;
    var books = this.getParallelBook(chunk.bkid, remote);
    var bookats = books.map(function (id) { return bk.fields.id.values.indexOf(id); });
    //同名 被 getParallelBook 去除，加回去
    // if (!~books.indexOf(chunk.bkat)) bookats.push(chunk.bkat);
    var bookstart = sourceptk.defines.bk.linepos[chunk.bkat];
    var sourcelineoff = line - bookstart;
    var out = [];
    for (var i = 0; i < bookats.length; i++) {
        var bkid = bk.fields.id.values[bookats[i]];
        var _a = this.rangeOfAddress('bk#' + bkid + '.ck#' + chunk.id), start = _a[0], end = _a[1];
        var bookstart_1 = bk.linepos[bookats[i]];
        var theline = bookstart_1 + sourcelineoff;
        if (theline <= end) {
            out.push([this, start - bookstart_1, theline]);
        }
    }
    return out;
}
function getParallelBook(bookname, remote) {
    if (typeof bookname == 'number') {
        bookname = this.defines.bk.fields.id.values[bookname];
    }
    if (!bookname)
        return [];
    var prefix = bookPrefix(bookname);
    //如果不是remote，那不能同名
    var books = this.defines.bk.fields.id.values.filter(function (it) { return bookPrefix(it) == prefix && (remote || bookname !== it); });
    return books;
}
//see compiler/linkfield.ts  for structure
function foreignLinksAtTag(tagname, line) {
    var tag = this.defines[tagname];
    var linepos = tag === null || tag === void 0 ? void 0 : tag.linepos;
    if (!tag || !linepos)
        return [];
    var at = bsearchNumber(linepos, line);
    var val = tag.fields.id.values[at].toString(); //
    var out = [];
    for (var sptkname in this.foreignlinks) {
        var sptk = poolGet(sptkname);
        var linkarr = this.foreignlinks[sptkname];
        for (var i = 0; i < linkarr.length; i++) {
            var _a = linkarr[i], srctag = _a[0]; _a[1]; var targettagname = _a[2], idStrArr = _a[3], idxarr = _a[4];
            if (targettagname !== tagname)
                continue;
            var srclinepos = sptk.defines[srctag].linepos;
            var at2 = idStrArr.find(val);
            var tagvalues = this.defines[srctag].fields['@'].values;
            var arr = idxarr[at2];
            for (var j = 0; j < (arr === null || arr === void 0 ? void 0 : arr.length); j++) {
                var address = tagvalues[arr[j]];
                var line_1 = srclinepos[arr[j]];
                var ck = sptk.nearestChunk(line_1 + 1);
                out.push({ text: address, line: line_1, ck: ck, basket: sptkname });
                // console.log(at,address);
            }
        }
    }
    return out;
}
function enumParallelsPtk(address) {
    var ptk = this;
    var range = ptk.rangeOfAddress(address);
    var ck = ptk.nearestChunk(range[0] + 1);
    if (!ck)
        return [];
    var paralleladdress = 'bk#' + ck.bkid + '.ck#' + ck.id;
    var ptks = poolParallelPitakas(ptk);
    var out = [ptk.header.name];
    for (var i = 0; i < ptks.length; i++) {
        var ptk2 = poolGet(ptks[i]);
        var _a = ptk2.rangeOfAddress(paralleladdress); _a[0]; var end = _a[1];
        if (end > 0) {
            out.push(ptks[i]);
        }
    }
    return out;
}

function addBacklinks(tagname, tptk, bk, targettagname, chunks, nlinks) {
    if (!tptk)
        tptk = '*'; //any ptk
    if (!this.backlinks[tptk])
        this.backlinks[tptk] = {};
    if (!this.backlinks[tptk][this.name]) {
        this.backlinks[tptk][this.name] = [];
    }
    this.backlinks[tptk][this.name].push([tagname, bk, targettagname, chunks, nlinks]);
}
function addForeignLinks(fptk) {
    for (var tptk in fptk.backlinks) {
        if (tptk == this.name || tptk === '*') { //link to me
            for (var sptk in fptk.backlinks[tptk]) {
                this.foreignlinks[sptk] = fptk.backlinks[tptk][sptk];
            }
        }
    }
}

function backLinksOf(bk, line) {
    var BK = this.LocalBackLinks[bk];
    if (!BK)
        return [];
    return BK[line] || [];
}
function backTransclusionOf(entry) {
    var ptk = this;
    if (!ptk.backtransclusions)
        return [];
    var key = ptk.keyOfEntry(entry);
    var items = ptk.backtransclusions[key] || [];
    return items.map(function (it) { return entriesOfKey(ptk, it, true); }).filter(function (it) { return !!it; });
}
function guessBookId(t) {
    t = removeBracket(t);
    var m = t.match(CJKWordBegin_Reg);
    if (m) {
        return this.BookIdByName[m[1]];
    }
}
var buildBookNames = function (ptk) {
    var _a;
    for (var i = 0; i < ((_a = ptk.defines.bk) === null || _a === void 0 ? void 0 : _a.linepos.length); i++) {
        var id = ptk.defines.bk.fields.id.values[i];
        var t = ptk.defines.bk.getInnertext(i);
        if (!t)
            continue;
        ptk.BookIdByName[t] = id;
        ptk.BookIdByName[toSim(t)] = id;
        ptk.BookNameById[id] = t;
    }
};
function bookNameById(id) {
    var tag = this.getTagById('bk', id);
    return this.defines.bk.getInnertext(tag === null || tag === void 0 ? void 0 : tag.at);
}
var findEntryByDk = function (ptk, dkid, bk) {
    var _a;
    Object.keys(ptk.columns);
    if (bk && ptk.columns[bk]) {
        var at = ptk.columns[bk].dkat.indexOf(parseInt(dkid));
        if (~at)
            return ptk.columns[bk].keys.get(at);
    }
    else {
        for (var col in ptk.columns) {
            var at = (_a = ptk.columns[col].dkat) === null || _a === void 0 ? void 0 : _a.indexOf(dkid);
            if (~at)
                return ptk.columns[col].keys.get(at);
        }
    }
    return '';
};
function buildBackTransclusions(ptk) {
    var section = ptk.getSection('_backtransclusions');
    if (!section.length)
        return {};
    var out = {};
    var keys = new StringArray(section.shift(), { sep: LEMMA_DELIMITER });
    var dk = ptk.defines.dk;
    if (!dk)
        return out;
    for (var i = 0; i < keys.len(); i++) {
        var linepos = unpackIntDelta(section.shift());
        //convert linepos to entry
        var entries = [];
        for (var j = 0; j < linepos.length; j++) {
            var dkat = dk.linepos.indexOf(linepos[j]);
            if (~dkat) {
                var bk = ptk.nearestTag(linepos[j], 'bk', 'id');
                var dkid = dk.fields.id.values[dkat];
                var e = findEntryByDk(ptk, dkid, bk);
                if (e)
                    entries.push(e);
            }
        }
        //resolve the key from entry, which is not determine at compile time
        var _a = columnTextByKey(ptk, keys.get(i)); _a[0]; var objarr = _a[1];
        var key = objarr[0].key;
        if (!out[key])
            out[key] = entries;
        else {
            out[key].concat(entries);
            out[key].sort();
        }
    }
    return out;
}
function buildLocalBacklinks(ptk) {
    var X = ptk.defines.x;
    var Y = ptk.defines.y;
    var L = {};
    if (!X || !Y)
        return;
    var XID = X.fields.id.values;
    var Xlinepos = ptk.defines.x.linepos;
    for (var i = 0; i < XID.length; i++) {
        var _a = parsePageBookLine(XID[i]), page = _a[0], book = _a[1], line = _a[2];
        if (!book) {
            var innertext = X.getInnertext(i);
            book = guessBookId.call(ptk, innertext);
        }
        var sbook = ptk.nearestTag(Xlinepos[i], 'bk', 'id');
        if (!book)
            book = sbook;
        var addr = 'bk#' + book + '.y#' + page;
        var _b = ptk.rangeOfAddress(addr), s = _b[0]; _b[1];
        //console.log(page,book,line,addr,s,e);
        if (!L[book])
            L[book] = {};
        if (!L[book][s + line])
            L[book][s + line] = [];
        L[book][s + line].push(Xlinepos[i]);
    }
    return L;
}
var enableBacklinkFeature = function (ptk) {
    ptk.BookIdByName = {};
    ptk.BookNameById = {};
    ptk.guessBookId = guessBookId;
    ptk.bookNameById = bookNameById;
    //initial build
    ptk.backLinksOf = backLinksOf;
    ptk.backTransclusionOf = backTransclusionOf;
    ptk.keyOfEntry = keyOfEntry;
    buildBookNames(ptk);
    ptk.LocalBackLinks = buildLocalBacklinks(ptk);
    ptk.backtransclusions = buildBackTransclusions(ptk);
};

function postingLine(posting) {
    return plContain(posting, this.inverted.tokenlinepos)[0];
}
var enableFTSFeature = function (ptk) {
    var section = ptk.getSection("_tokens");
    if (!ptk.inverted && section && section.length) {
        section.shift();
        var postingstart = ptk.sectionRange('_postings')[0];
        ptk.queryCache = {};
        ptk.inverted = new Inverted(section, postingstart);
        ptk.loadPostings = loadPostings;
        ptk.loadPostingsSync = loadPostingsSync;
        ptk.getPostings = getPostings;
        ptk.postingline = postingLine;
        ptk.searchSentenceSync = searchSentenceSync;
        ptk.searchSentence = searchSentence;
        ptk.parseQuery = parseQuery;
        ptk.scanText = scanText;
        ptk.hitsOfLine = hitsOfLine;
        ptk.scoreLine = scoreLine;
    }
};

var enableTOCFeature = function (ptk) {
    //build chunk toc
    var section = ptk.getSection("toc");
    if (ptk.attributes.toctag && section && section.length > 1) {
        var firstline = section.shift();
        var name_1 = sourceType(firstline).name;
        if (!ptk.tocs)
            ptk.tocs = {};
        ptk.tocs[name_1 || '*'] = new TableOfContent(section, name_1);
        var toctags = ptk.attributes.toctag.split(',');
        buildTocTag.call(ptk, toctags);
    }
};

function getCaption(at, short) {
    var _a, _b, _c, _d;
    if (short === void 0) { short = false; }
    var chunktag = this.defines.ck;
    var caption = chunktag === null || chunktag === void 0 ? void 0 : chunktag.getInnertext(at);
    var id = (_b = (_a = chunktag === null || chunktag === void 0 ? void 0 : chunktag.fields) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.values[at];
    var onChunkCaption = this.template.onChunkCaption;
    if (!caption) {
        caption = ((_d = (_c = this.columns[chunktag === null || chunktag === void 0 ? void 0 : chunktag.column]) === null || _c === void 0 ? void 0 : _c.keys) === null || _d === void 0 ? void 0 : _d.get(at)) || '';
        if (!caption && onChunkCaption)
            caption = onChunkCaption(id);
    }
    var at2 = caption === null || caption === void 0 ? void 0 : caption.indexOf(";");
    var shortcaption = caption || '';
    if (~at2) {
        shortcaption = caption.slice(at2);
        caption = caption.slice(0, at2);
    }
    return short ? shortcaption : caption;
}
function caption(at) {
    //return onChunkCaption?caption:id+'.'+caption;
    var caption = this.getCaption(at);
    var depth = 0;
    while (caption && caption.endsWith('-')) {
        depth++;
        caption = caption.slice(0, caption.length - 1);
    }
    var at2 = at, parents = [];
    while (at2 > 0 && depth) {
        at2--;
        var par = this.getCaption(at2).split(/[- ]+/);
        var pdepth = par.length;
        while (!par[par.length - 1])
            par.pop();
        if (pdepth - 1 > depth) ;
        else if (par.length > 1 || pdepth == 1) {
            while (par.length && depth) {
                parents.unshift('-' + par.pop());
                depth--;
            }
        }
    }
    return caption + parents.join('');
}
function nearestChunk(line) {
    var chunktag = this.defines.ck || this.defines.dk;
    var at = this.nearestTag(line, chunktag);
    return this.getChunk(at);
}
function getHeading(line) {
    var _a, _b;
    if (!line)
        return '';
    var chunktag = this.defines.ck;
    var booktag = this.defines.bk;
    var linepos = (chunktag === null || chunktag === void 0 ? void 0 : chunktag.linepos) || [];
    var at = bsearchNumber(linepos, line + 1) - 1;
    var lineoff = line - linepos[at];
    var id = (_b = (_a = chunktag === null || chunktag === void 0 ? void 0 : chunktag.fields) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.values[at];
    var bkat = this.nearestTag(line + 1, booktag);
    var bk = getBookInfo.call(this, bkat);
    var bkid = bk === null || bk === void 0 ? void 0 : bk.id;
    /* TODO
    if caption has leading - , trace back to fetch ancestor node,
    this is suitable for tree structure with less branches,
    not suitable for dictionary wordheads
    */
    var caption = this.caption(at);
    return { id: id, tagname: 'ck', caption: caption, lineoff: lineoff, bk: bk, bkid: bkid };
}
function getBookInfo(at) {
    var _a;
    var booktag = this.defines.bk;
    var bkid = booktag.fields.id.values[at];
    var bkcaption = booktag === null || booktag === void 0 ? void 0 : booktag.getInnertext(at);
    var short = bkcaption.slice(0, 2);
    var bkheading = ((_a = booktag === null || booktag === void 0 ? void 0 : booktag.fields.heading) === null || _a === void 0 ? void 0 : _a.values[at]) || (booktag === null || booktag === void 0 ? void 0 : booktag.getInnertext(at));
    var at2 = bkcaption.indexOf(";");
    if (~at2) {
        short = bkcaption.slice(at2 + 1);
        bkcaption = bkcaption.slice(0, at2);
    }
    return { id: bkid, caption: bkcaption, short: short, heading: bkheading, at: at };
}
function getChunk(at) {
    at = parseInt(at);
    var chunktag = this.defines.ck || this.defines.dk;
    var booktag = this.defines.bk;
    if (at < 0)
        return null;
    if (at >= chunktag.fields.id.values.length)
        return null;
    var line = chunktag.linepos[at];
    var bkat = this.nearestTag(line + 1, booktag);
    var bk = getBookInfo.call(this, bkat);
    var bkid = bk.id; //legacy
    var id = chunktag.fields.id.values[at];
    var innertext = chunktag.getInnertext(at);
    var caption = this.caption(at);
    var depth = chunktag.depths ? chunktag.depths[at] || 1 : 1;
    return { bk: bk, bkid: bkid, bkat: bkat, caption: caption, at: at, id: id, depth: depth, line: chunktag.linepos[at], lineend: chunktag.linepos[at + 1] || -1, innertext: innertext };
}
var resetBy = function (ptk, tagname) {
    var _a;
    for (var t in ptk.defines) {
        var tag = ptk.defines[t];
        if (((_a = tag.attrs.reset) === null || _a === void 0 ? void 0 : _a.split(',').indexOf(tagname)) > -1) {
            return t;
        }
    }
    return null;
};
function ancestorChunks(at, start) {
    var chunktag = this.defines.ck;
    if (!chunktag.depths)
        return [];
    var line = chunktag.linepos[at];
    var depth = chunktag.depths[at];
    var out = [];
    while (line > start && depth > 1) {
        if (depth > chunktag.depths[at]) {
            out.unshift(at);
            depth--;
        }
        at--;
        line = chunktag.linepos[at];
    }
    return out;
}
function prevsiblingChunk(at, start) {
    var p = at - 1;
    var chunktag = this.defines.ck;
    if (!chunktag.depths && at > 0)
        return at - 1;
    while (p > 0) {
        if (chunktag.depths[p] == chunktag.depths[at])
            return p;
        else if (chunktag.depths[p] < chunktag.depths[at])
            break;
        p--;
        if (start < chunktag.linepos[p])
            break;
    }
    return -1;
}
function nextsiblingChunk(at, end) {
    var p = at + 1;
    var chunktag = this.defines.ck;
    if (!chunktag.depths && at < end)
        return at + 1;
    while (p < chunktag.linepos.length) {
        if (chunktag.depths[p] == chunktag.depths[at])
            return p;
        else if (chunktag.depths[p] < chunktag.depths[at])
            break;
        p++;
        if (chunktag.linepos[p] >= end)
            break;
    }
    return -1;
}
function firstChildChunk(at) {
    var chunktag = this.defines.ck;
    if (!chunktag.depths)
        return -1;
    if (chunktag.depths[at + 1] == chunktag.depths[at] + 1)
        return at + 1;
    return -1;
}
function neighborChunks(at) {
    var ptk = this;
    // const chunktag=this.defines.ck
    // const ck=this.nearestChunk( chunktag.linepos[at] );   
    // at=ck.at-1;
    var resettag = this.defines[resetBy(this, 'ck')];
    var nearest = resettag ? this.nearestTag(at, resettag) - 1 : 0;
    var start = resettag ? resettag.linepos[nearest] : 0;
    var end = resettag ? (resettag.linepos[nearest + 1] || ptk.header.eot) : ptk.header.eot;
    var ancestors = ancestorChunks.call(this, at, start);
    var out = ancestors.map(function (it) { return ptk.getChunk.call(ptk, it); });
    var prev = prevsiblingChunk.call(this, at);
    if (prev > -1 && (!ancestors.length || ancestors[ancestors.length - 1] < prev)) {
        out.push(this.getChunk(prev));
    }
    out.push(this.getChunk(at));
    //add bookname
    var first = firstChildChunk.call(this, at, start);
    if (first > -1)
        out.push(this.getChunk(first));
    var next = nextsiblingChunk.call(this, at, end);
    if (next > -1)
        out.push(this.getChunk(next));
    return out;
}

function humanName(short, lang) {
    if (lang === void 0) { lang = 'zh'; }
    var n = this.attributes[lang] || this.name;
    var at = n.indexOf('|');
    if (at == -1)
        return n;
    return short ? n.slice(0, at) : n.slice(at + 1);
}
var enableTagFeature = function (ptk) {
    ptk.innertext = innertext;
    ptk.humanName = humanName;
    ptk.fetchAddress = fetchAddress;
    ptk.fetchAddressExtra = fetchAddressExtra;
    ptk.findClosestTag = findClosestTag;
    ptk.validId = validId;
    ptk.nearestTag = nearestTag;
    ptk.getTagFields = getTagFields;
    ptk.queryTagFields = queryTagFields;
    ptk.tagInRange = tagInRange;
    ptk.tagCount = tagCount;
    ptk.fetchTag = fetchTag;
    ptk.getTagById = getTagById;
    ptk.rangeOfAddress = rangeOfAddress;
    ptk.rangeOfElementId = rangeOfElementId;
    ptk.nearestChunk = nearestChunk;
    ptk.getChunk = getChunk;
    ptk.neighborChunks = neighborChunks;
    ptk.getCaption = getCaption;
    ptk.getHeading = getHeading;
    ptk.caption = caption;
    ptk.alignable = alignable;
};

/* accelon 23 backend */
var enableFeature = function (ptk, feature) {
    if (feature == "tag") {
        enableTagFeature(ptk);
    }
    else if (feature == 'toc') {
        enableTOCFeature(ptk);
    }
    else if (feature == 'fts') {
        enableFTSFeature(ptk);
    }
    else if (feature == 'backlink') {
        enableBacklinkFeature(ptk);
    }
    else if (feature == 'footnote') {
        enableFootnoteFeature(ptk);
    }
};
var enableFeatures = function (ptk, features) {
    if (!Array.isArray(features))
        features = [features];
    features.forEach(function (f) { return enableFeature(ptk, f); });
};
var enableFootnoteFeature = function (ptk) {
    ptk.inlineNote = inlineNote;
    ptk.footNoteAddress = footNoteAddress;
    ptk.footNoteByAddress = footNoteByAddress;
    ptk.footNoteInTSV = footNoteInTSV;
};
var enableAccelon23Features = function (ptk) {
    //check fields
    enableTagFeature(ptk);
    enableTOCFeature(ptk);
    enableFTSFeature(ptk);
    enableBacklinkFeature(ptk);
    enableFootnoteFeature(ptk);
    ptk.scanColumnFields = scanColumnFields;
    ptk.searchColumnField = searchColumnField;
    ptk.tagAtAction = tagAtAction;
    ptk.scanCache = {};
    ptk.queryCache = {};
    ptk.columnField = columnField;
    ptk.foreignLinksAtTag = foreignLinksAtTag;
    ptk.getParallelBook = getParallelBook;
    ptk.getParallelLine = getParallelLine;
    ptk.enumParallelsPtk = enumParallelsPtk;
    ptk.taggedLines = {};
    ptk.foreignlinks = {};
    ptk.addForeignLinks = addForeignLinks;
    ptk.addBacklinks = addBacklinks;
    ptk.backlinks = {};
    ptk.rowOf = rowOf;
    ptk.parallels = {}; //parallels showing flag, ptkname:string, onoff:boolean
};

var LispToken;
(function (LispToken) {
    LispToken[LispToken["Opening"] = 1] = "Opening";
    LispToken[LispToken["Closing"] = 2] = "Closing";
    LispToken[LispToken["Action"] = 3] = "Action";
})(LispToken || (LispToken = {}));
function readToken(token) {
    if (token === '(') {
        return { type: LispToken.Opening, value: null };
    }
    else if (token === ')') {
        return { type: LispToken.Closing, value: null };
    }
    else {
        return { type: LispToken.Action, value: token };
    }
}
function tokenize(expression) {
    return expression
        .replace(/\(/g, '^(^')
        .replace(/\)/g, '^)^')
        .trim().split(/\^/).map(readToken);
}
function buildAST(tokens) {
    var depth = 0;
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        if (token.type == LispToken.Opening) {
            depth++;
        }
        else if (token.type == LispToken.Closing) {
            if (depth > 0)
                depth--;
        }
        else {
            out.push([depth, token.value]);
        }
    }
    return out;
}
function parseLisp(expression) {
    return buildAST(tokenize(expression));
}

function loadLines(lva_1) {
    return __awaiter(this, arguments, void 0, function (lva, noparallel) {
        var jobs, out, divisions, pitaka_lines, i, parallels, ptk, _loop_1, j, ptkname, ptk, seq, i, _a, action, ptkname, depth, ownerdraw, highlightline, from, closable, ptk, segment, lines, linetexts, prevdepth, onLineText, j, text, edge, closable_1, sponsor, correspondences, highlight;
        var _b;
        var _c, _d;
        if (noparallel === void 0) { noparallel = false; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    jobs = [], out = [];
                    divisions = lva.divisions();
                    pitaka_lines = {};
                    for (i = 0; i < divisions.length; i++) {
                        if (!pitaka_lines[divisions[i].ptkname])
                            pitaka_lines[divisions[i].ptkname] = [];
                        (_b = pitaka_lines[divisions[i].ptkname]).push.apply(_b, divisions[i].getLines());
                        parallels = divisions[i].ownerdraw ? [] : divisions[i].getParallelWithDiff();
                        ptk = usePtk(divisions[i].ptkname);
                        if (!noparallel) {
                            _loop_1 = function (j) {
                                var _f;
                                var _g = parallels[j], pptk = _g[0], linediff = _g[1];
                                if (!ptk.parallels[pptk.name])
                                    return "continue";
                                var lines = divisions[i].getLines();
                                if (linediff)
                                    lines = lines.map(function (it) { return it + linediff; });
                                if (!pitaka_lines[pptk.name])
                                    pitaka_lines[pptk.name] = [];
                                (_f = pitaka_lines[pptk.name]).push.apply(_f, lines);
                            };
                            for (j = 0; j < parallels.length; j++) {
                                _loop_1(j);
                            }
                        }
                    }
                    for (ptkname in pitaka_lines) {
                        ptk = usePtk(ptkname);
                        if (!ptk)
                            continue;
                        pitaka_lines[ptkname].sort(function (a, b) { return a - b; });
                        jobs.push(ptk.loadLines(pitaka_lines[ptkname]));
                    }
                    return [4 /*yield*/, Promise.all(jobs)];
                case 1:
                    _e.sent();
                    seq = 0;
                    for (i = 0; i < divisions.length; i++) { //將巢狀結構轉為行陣列，標上深度及框線
                        _a = divisions[i], action = _a.action, ptkname = _a.ptkname, depth = _a.depth, ownerdraw = _a.ownerdraw, highlightline = _a.highlightline, _a.first, from = _a.from, closable = _a.closable;
                        ptk = usePtk(ptkname);
                        if (ownerdraw) {
                            out.push({ seq: seq, idx: i, ownerdraw: ownerdraw, depth: depth, ptkname: ptkname, key: ptkname + ':' + action, closable: closable });
                            seq++;
                            continue;
                        }
                        if (!ptk)
                            continue;
                        segment = [];
                        lines = divisions[i].getLines();
                        linetexts = ptk.getLines(lines);
                        prevdepth = i ? divisions[i - 1].depth : 0;
                        onLineText = (_c = ptk.template) === null || _c === void 0 ? void 0 : _c.onLineText;
                        for (j = 0; j < linetexts.length; j++) { //優先顯示更深的層級框線
                            text = onLineText ? onLineText(linetexts[j], lines[j]) : linetexts[j];
                            edge = 0;
                            if (j === 0)
                                edge |= 1; //上框線
                            if (j === linetexts.length - 1)
                                edge |= 2; //下框線  edge==3 只有一行的顯示上下框
                            //本行的層級更深，除去上行的下框線
                            // if (!prevdepth && i && out.length && out[out.length-]
                            if (depth > prevdepth && (edge & 2 === 2) && out.length)
                                out[out.length - 1].edge ^= 2;
                            //上行的層級更深，除去本行的上框線不顯示
                            if (prevdepth > depth && (edge & 1 === 1))
                                edge ^= 1;
                            closable_1 = (((edge == 1 || edge == 3)) || !divisions[i].diggable);
                            sponsor = '';
                            correspondences = (from == 0 && j == 0) ? (_d = ptk.template) === null || _d === void 0 ? void 0 : _d.getCorrespondence(ptk, lines[j]) : [];
                            highlight = highlightline - divisions[i].from == j;
                            segment.push({ seq: seq, idx: j == 0 ? i : -1, ptkname: ptkname, key: ptkname + ':' + (lines[j]),
                                line: lines[j], highlight: highlight, text: text, depth: depth, edge: edge, closable: closable_1, sponsor: sponsor, correspondences: correspondences });
                            seq++;
                        }
                        out.push.apply(out, segment);
                    }
                    lva.loadedItems = out;
                    return [2 /*return*/, out];
            }
        });
    });
}
function load(lva) {
    return __awaiter(this, void 0, void 0, function () {
        var divisions, pitakas, i, ptkname, jobs, _a, _b, _c, _i, ptkname, i, out;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (typeof lva == 'undefined')
                        lva = this;
                    else if (typeof lva == 'string')
                        lva = new LVA(lva);
                    divisions = lva.divisions();
                    pitakas = {};
                    //找出 lva 含的ptkname 及區段			
                    for (i = 0; i < divisions.length; i++) {
                        ptkname = divisions[i].ptkname;
                        if (!pitakas[ptkname])
                            pitakas[ptkname] = [];
                        pitakas[ptkname].push(divisions[i]);
                    }
                    jobs = [];
                    _a = pitakas;
                    _b = [];
                    for (_c in _a)
                        _b.push(_c);
                    _i = 0;
                    _d.label = 1;
                case 1:
                    if (!(_i < _b.length)) return [3 /*break*/, 4];
                    _c = _b[_i];
                    if (!(_c in _a)) return [3 /*break*/, 3];
                    ptkname = _c;
                    return [4 /*yield*/, openPtk(ptkname)];
                case 2:
                    _d.sent();
                    _d.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [4 /*yield*/, Promise.all(jobs)];
                case 5:
                    _d.sent();
                    i = 0;
                    _d.label = 6;
                case 6:
                    if (!(i < divisions.length)) return [3 /*break*/, 9];
                    return [4 /*yield*/, divisions[i].run()];
                case 7:
                    _d.sent();
                    _d.label = 8;
                case 8:
                    i++;
                    return [3 /*break*/, 6];
                case 9: return [4 /*yield*/, loadLines(lva)];
                case 10:
                    out = _d.sent();
                    return [2 /*return*/, out];
            }
        });
    });
}

var parallelWithDiff = function (ptk, line, includeself, local, remote) {
    if (includeself === void 0) { includeself = false; }
    if (local === void 0) { local = true; }
    if (remote === void 0) { remote = false; }
    var out = [];
    if (!ptk)
        return out;
    //因為nearesttag 返回 0 表示 出現在第一個bk 之前
    var bkat = ptk.nearestTag(line + 1, 'bk');
    var bookstart = ptk.defines.bk.linepos[bkat];
    if (includeself) {
        out.push([ptk, bookstart, line]);
    }
    var lineoff = line - bookstart;
    var bkid = ptk.defines.bk.fields.id.values[bkat];
    var books = ptk.getParallelBook(bkid);
    if (local) {
        for (var i = 0; i < books.length; i++) {
            var _a = ptk.rangeOfAddress('bk#' + books[i]), start = _a[0], end = _a[1];
            if (lineoff <= end - start) {
                //假設每一行都對齊，所以返回 書的行差
                out.push([ptk, start - bookstart, start + lineoff]);
            }
        }
    }
    if (remote) {
        var parallelPitakas = poolParallelPitakas(ptk);
        for (var i = 0; i < parallelPitakas.length; i++) {
            var pptk = usePtk(parallelPitakas[i]);
            // const lineoff=line-bkstart;
            // const [start]=pptk.rangeOfAddress('bk#'+bkid);
            var lines = pptk.getParallelLine(ptk, line, true);
            lines.forEach(function (it) { return out.push(__spreadArray([], it, true)); });
        }
    }
    return out;
};
var getParallelLines = function (ptk_1, line_1, _out_1) {
    var args_1 = [];
    for (var _i = 3; _i < arguments.length; _i++) {
        args_1[_i - 3] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([ptk_1, line_1, _out_1], args_1, true), void 0, function (ptk, line, _out, opts) {
        var lines, out, i, _a, ptk_2, line_2, linetext, heading;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    lines = parallelWithDiff(ptk, line, true, opts.local, opts.remote);
                    out = [];
                    i = 0;
                    _b.label = 1;
                case 1:
                    if (!(i < lines.length)) return [3 /*break*/, 4];
                    _a = lines[i], ptk_2 = _a[0], _a[1], line_2 = _a[2];
                    return [4 /*yield*/, ptk_2.loadLines([line_2])];
                case 2:
                    _b.sent();
                    linetext = ptk_2.getLine(line_2);
                    heading = ptk_2.getHeading(line_2);
                    out.push({ ptk: ptk_2, heading: heading, linetext: linetext, line: line_2 });
                    _b.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4:
                    if (_out)
                        _out.push.apply(_out, out);
                    return [2 /*return*/, out];
            }
        });
    });
};

var EXCERPTACTIONPREFIX = '*';
var GUIDEACTIONPREFIX = '!';
var TITLECOUNTACTIONPREFIX = '~';
var OWNERDRAWPREFIX = '@';
var COLUMNFIELDSEP = ".";
var Action = /** @class */ (function () {
    function Action(addr, depth, dividx) {
        if (depth === void 0) { depth = 0; }
        if (dividx === void 0) { dividx = 0; }
        this.act = Action.parse(addr.action);
        this.action = addr.action;
        this.depth = depth;
        this.first = 0; //first line of the chunk
        this.last = 0; //last line of the chunk
        this.highlightline = addr.highlightline || -1; //line with search keyword
        this.from = addr.from;
        this.till = addr.till || -1; //-1 to the end
        this.res = [];
        this.text = '';
        this.lines = []; //for search result, non continous line
        this.diggable = false;
        this.closable = true;
        this.ptkname = addr.ptkname;
        this.opts = {}; //display options
        this.dividx = dividx;
        this.pagable = true;
    }
    Action.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        });
    };
    Action.prototype.lineOf = function (idx) {
        return this.first + idx;
    };
    Action.prototype.getLines = function () {
        var out = [];
        var till = this.till;
        if (till == -1)
            till = this.from + ACTIONPAGESIZE; //show partial content if not mention till
        for (var i = this.from; i < till; i++) {
            var line = this.lineOf(i);
            if (line < this.first || line >= this.last)
                continue;
            out.push(line);
        }
        return out;
    };
    Action.prototype.getParallelWithDiff = function () {
        var ptk = usePtk(this.ptkname);
        return parallelWithDiff(ptk, this.first + this.from);
    };
    Action.parse = function (action) {
        return parseCriteria(action);
    };
    return Action;
}());

var RangeAction = /** @class */ (function (_super) {
    __extends(RangeAction, _super);
    function RangeAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        var _this = _super.call(this, addr, depth) || this;
        _this.eleid = _this.action;
        _this.address = addr;
        _this.diggable = true;
        return _this;
    }
    RangeAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ptk;
            var _a;
            return __generator(this, function (_b) {
                ptk = usePtk(this.ptkname);
                _a = ptk.rangeOfAddress(this.address), this.first = _a[0], this.last = _a[1];
                return [2 /*return*/];
            });
        });
    };
    return RangeAction;
}(Action));

var GuideAction = /** @class */ (function (_super) {
    __extends(GuideAction, _super);
    function GuideAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        var _this = _super.call(this, addr, depth) || this;
        _this.address = addr;
        return _this;
    }
    GuideAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ptk, caption, name, out, action, idx, actionprefix, _a, choices, groupby, groupfilter, col_1, master_1, _b, items;
            return __generator(this, function (_c) {
                ptk = usePtk(this.ptkname);
                caption = ptk.innertext(this.address);
                name = this.act[0].name;
                out = [];
                action = this.address.action.slice(1);
                idx = this.dividx;
                actionprefix = GUIDEACTIONPREFIX;
                if (ptk.template.guidedrawer) {
                    this.ownerdraw = { painter: ptk.template.guidedrawer, data: { from: this.from, actionprefix: actionprefix, idx: idx, name: name, action: action, caption: caption, ptk: ptk } };
                    return [2 /*return*/];
                }
                if (ptk.template.parseChoice) {
                    _a = ptk.template.parseChoice(action), choices = _a[0], groupby = _a[1], groupfilter = _a[2];
                    col_1 = ptk.columns[ptk.template.filterColumn];
                    master_1 = ptk.defines[col_1.attrs.master];
                    _b = ptk.template.runFilter(ptk, col_1, { choices: choices, groupby: groupby, groupfilter: groupfilter }), items = _b.items, _b.groups;
                    out = items.map(function (idx) {
                        var line = master_1.linepos[idx];
                        var ck = ptk.nearestChunk(line);
                        var size = (master_1.linepos[idx + 1] ? master_1.linepos[idx + 1] : ptk.header.eot) - line;
                        var lineoff = line - ck.line;
                        var record = [];
                        var recordend = master_1.linepos[idx + 1];
                        for (var i = 0; i < col_1.fieldnames.length; i++) {
                            var def = ptk.defines[col_1.fieldnames[i]];
                            if (!def)
                                continue;
                            var at = bsearchNumber(def.linepos, line); //nearest record-field
                            if (def.linepos[at] < recordend) {
                                record.push(def.linepos[at]);
                            }
                        }
                        if (!ck)
                            return null;
                        return { chunkname: ck.name, line: line, size: size, ck: ck, lineoff: lineoff, record: record };
                    }).filter(function (it) { return !!it; });
                }
                this.ownerdraw = { painter: 'guide', data: { from: this.from, actionprefix: actionprefix, idx: idx, items: out, name: name, action: action, caption: caption, ptk: ptk } };
                return [2 /*return*/];
            });
        });
    };
    return GuideAction;
}(Action));

// import {runInfo} from './infoaction.ts';
var CustomAction = /** @class */ (function (_super) {
    __extends(CustomAction, _super);
    function CustomAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        var _this = _super.call(this, addr, depth) || this;
        _this.painter = addr.action.slice(1);
        _this.ptkname = addr.ptkname;
        _this.diggable = true;
        return _this;
    }
    CustomAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var items, ptk;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, usePtk(this.ptkname)];
                    case 1:
                        ptk = _a.sent();
                        if (this.painter == 'systeminfo') {
                            items = [];
                        }
                        this.ownerdraw = { painter: this.painter, data: { ptk: ptk, items: items, name: this.address, ptkname: this.ptkname } };
                        this.last = 1;
                        return [2 /*return*/];
                }
            });
        });
    };
    return CustomAction;
}(Action));

var ExcerptAction = /** @class */ (function (_super) {
    __extends(ExcerptAction, _super);
    function ExcerptAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        return _super.call(this, addr, depth) || this;
    }
    ExcerptAction.prototype.lineOf = function (idx) {
        return this.lines[idx];
    };
    ExcerptAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ptk, _a, name, tofind, section, _b, lines, chunks, till, from, arr, lines2, hits, phraselength, cobj, samechunkline, at, caption;
            return __generator(this, function (_c) {
                ptk = usePtk(this.ptkname);
                _a = this.act[0], name = _a.name, tofind = _a.tofind;
                section = name.slice(1);
                _b = listExcerpts(ptk, tofind, { range: section }), lines = _b.lines, chunks = _b.chunks;
                till = this.till;
                from = this.from;
                if (till == -1)
                    till = this.from + ACTIONPAGESIZE;
                arr = lines;
                this.first = 0;
                this.last = arr.length;
                if (till >= arr.length)
                    till = arr.length;
                arr = arr.slice(from, till);
                lines2 = arr.map(function (it) { return parseInt(it[0]); });
                hits = arr.map(function (it) { return it[1].map(function (n) { return Math.floor(n / MAXPHRASELEN); }); });
                phraselength = arr.map(function (it) { return it[1].map(function (n) { return n % MAXPHRASELEN; }); });
                cobj = fromObj(chunks, function (a, b) { return a; });
                samechunkline = cobj.length == 1 ? cobj[0] : -1;
                at = ptk.header.fulltext.indexOf(section);
                caption = ptk.header.fulltextcaption[at];
                this.ownerdraw = { painter: 'excerpt', data: { last: this.last, samechunkline: samechunkline, section: section, from: this.from, name: name, hitcount: hitcount, caption: caption, ptk: ptk, tofind: tofind, lines: lines2, hits: hits, phraselength: phraselength } };
                return [2 /*return*/];
            });
        });
    };
    return ExcerptAction;
}(Action));

/*
    lookup column[name] with key, if keycolname is supplied, convert to norm key
*/
var lookupKeyColumn = function (ptk, name, key, keycolname) {
    var column = ptk.columns[name];
    var at = column.findKey(key);
    if (keycolname) { //normalize the key
        var keycolumn = ptk.columns[keycolname];
        var norm_at = keycolumn.fieldnames.indexOf('norm');
        var at2 = keycolumn.findKey(key);
        if (~norm_at) { // use the norm form
            var norm = keycolumn.fieldvalues[norm_at][at2];
            if (norm) {
                key = norm;
                at = column.findKey(key);
            }
        }
    }
    if (!~at)
        return [];
    var out = column.fieldvalues[1][at];
    return out;
};
var countMembers = function (items, foreigncol, tofind, col) {
    var members = {};
    var tofinds = tofind.split(',');
    for (var i = 0; i < items.length; i++) {
        var at = foreigncol.findKey(items[i]);
        var list = foreigncol.fieldvalues[0][at];
        for (var i_1 = 0; i_1 < (list === null || list === void 0 ? void 0 : list.length); i_1++) {
            if (!members[list[i_1]])
                members[list[i_1]] = 0;
            members[list[i_1]]++;
        }
    }
    var arr = fromObj(members, true);
    if (tofind && arr.length) { // caller supply tofind, trim redundant items
        if (col.findKey(tofinds[0]) == arr[0][0]) {
            arr.shift(); //drop dup the key
        }
        var avg_1 = arr.reduce(function (acc, it) { return it[1] + acc; }, 0) / arr.length;
        arr = arr.filter(function (it) { return it[1] >= avg_1 / 2; });
        var drop = tofinds.length - 1;
        while (drop) {
            arr.shift();
            drop--;
        }
    }
    return arr;
};
var threshold = 0.7;
var calApprox = function (col, members) {
    var idx = 0;
    if (col.attrs.keytype !== 'serial')
        idx++;
    var out = [];
    var values = col.fieldvalues[idx];
    for (var i = 0; i < values.length; i++) {
        var v = values[i];
        var similarity = similarSet(v, members);
        if (similarity > threshold) {
            out.push([i, similarity]);
        }
    }
    return out;
};

var BooleanExcerptAction = /** @class */ (function (_super) {
    __extends(BooleanExcerptAction, _super);
    function BooleanExcerptAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        return _super.call(this, addr, depth) || this;
    }
    BooleanExcerptAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var hitcount, caption, lines, hits, phraselength, samechunkline, ptk, _a, name, tofind, _b, colname, members, tofinds, refcolname, items, linepos, till, from;
            return __generator(this, function (_c) {
                hitcount = 0, lines = [], hits = [], phraselength = [];
                ptk = usePtk(this.ptkname);
                _a = this.act[0], name = _a.name, tofind = _a.tofind;
                _b = name.slice(1).split('@'), colname = _b[0], members = _b[1];
                tofinds = tofind.split(',');
                refcolname = colname.replace(/s$/, '');
                items = intersects(tofinds.map(function (it) { return lookupKeyColumn(ptk, refcolname, it, members); }));
                linepos = ptk.defines[colname].linepos;
                lines = items.map(function (it) { return linepos[it]; });
                till = this.till;
                from = this.from;
                if (till == -1)
                    till = this.from + ACTIONPAGESIZE;
                this.first = 0;
                this.last = lines.length;
                if (till >= lines.length)
                    till = lines.length;
                lines = lines.slice(from, till);
                // console.log(this.from,this.last)
                this.ownerdraw = { painter: 'excerpt', data: { last: this.last, samechunkline: samechunkline, from: this.from, name: name, hitcount: hitcount, caption: caption, ptk: ptk, tofind: tofind, lines: lines, hits: hits, phraselength: phraselength } };
                return [2 /*return*/];
            });
        });
    };
    return BooleanExcerptAction;
}(Action));

var ApproxAction = /** @class */ (function (_super) {
    __extends(ApproxAction, _super);
    function ApproxAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        return _super.call(this, addr, depth) || this;
    }
    ApproxAction.prototype.lineOf = function (idx) {
        return this.lines[idx];
    };
    ApproxAction.prototype.getApprox = function (ptk, tagname, id) {
        if (ptk.template.getApprox) {
            return ptk.template.getApprox(ptk, tagname, id);
        }
        var col = ptk.columns[tagname];
        var at = col.findKey(id);
        var members = col.fieldvalues[0][at];
        // const foreigncol=ptk.columns[foreign];
        // console.log(    out.map(it=>  foreigncol.keys.get(it)));
        var approx = calApprox(col, members);
        var out = approx.map(function (_a) {
            var at = _a[0], similarity = _a[1];
            var _id = col.keys ? col.keys.get(at) : at + 1;
            var linepos = ptk.defines[tagname].linepos;
            return (id == _id) ? null : { id: _id, similarity: similarity, line: linepos[at] };
        }).filter(function (it) { return !!it; }).sort(function (a, b) { return b.similarity - a.similarity; });
        return out;
    };
    ApproxAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var hitcount, caption, samechunkline, ptk, _a, name, tofind, tagname, id, items, similarity, lines, till, from;
            return __generator(this, function (_b) {
                hitcount = 0;
                ptk = usePtk(this.ptkname);
                _a = this.act[0], name = _a.name, tofind = _a.tofind;
                tagname = name.slice(1);
                id = tofind.slice(tofind.indexOf('~') + 1);
                items = this.getApprox(ptk, tagname, id);
                similarity = items.map(function (it) { return it.similarity; });
                lines = items.map(function (it) { return it.line; });
                till = this.till || items.length;
                from = this.from || 0;
                if (till == -1)
                    till = from + ACTIONPAGESIZE;
                this.first = 0;
                this.last = lines.length;
                if (till >= lines.length)
                    till = lines.length;
                // lines=lines.slice(from,till);
                // console.log(this.from,this.last)
                this.ownerdraw = { painter: 'approx', data: { last: this.last, samechunkline: samechunkline, from: this.from, name: name, hitcount: hitcount, caption: caption, ptk: ptk, tofind: tofind, lines: lines, similarity: similarity } };
                return [2 /*return*/];
            });
        });
    };
    return ApproxAction;
}(Action));

var TitleCountAction = /** @class */ (function (_super) {
    __extends(TitleCountAction, _super);
    function TitleCountAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        return _super.call(this, addr, depth) || this;
    }
    TitleCountAction.prototype.lineOf = function (idx) {
        return this.lines[idx];
    };
    TitleCountAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ptk, _a, name, tofind, address, sectionrange, caption, _b, sectionfrom, sectionto, chunkcountobj, hitcount, items, chunktag, at1, at2, pagesize, j, title, line, ck, address_1, caption_1, _c, postings, i, pl, pllines, j, at, till, from, arr;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        ptk = usePtk(this.ptkname);
                        _a = this.act[0], name = _a.name, tofind = _a.tofind;
                        address = name.slice(1);
                        sectionrange = address ? ptk.rangeOfAddress(address) : [0, ptk.header.eot + 1];
                        caption = ptk.innertext(address);
                        _b = sectionrange.map(function (it) { return ptk.inverted.tokenlinepos[it]; }), sectionfrom = _b[0], sectionto = _b[1];
                        chunkcountobj = {}, hitcount = 0, items = [];
                        chunktag = ptk.defines.ck;
                        ptk.defines.bk;
                        if (!tofind) { //list all chunk in this section
                            at1 = chunktag ? bsearchNumber(chunktag.linepos, sectionrange[0]) : 0;
                            at2 = chunktag ? bsearchNumber(chunktag.linepos, sectionrange[1]) + 1 : 0;
                            pagesize = this.till - this.from;
                            if (pagesize < ACTIONPAGESIZE)
                                pagesize = ACTIONPAGESIZE;
                            for (j = at1 + this.from; j < at2; j++) {
                                title = chunktag.getInnertext(j);
                                line = chunktag.linepos[j];
                                ck = ptk.nearestChunk(line + 1);
                                address_1 = makeChunkAddress(ck);
                                caption_1 = ck.caption;
                                if (items.length >= pagesize)
                                    break;
                                items.push({ id: ck.id, bkid: ck.bkid, caption: caption_1, title: title, count: -1, address: address_1, line: line });
                            }
                            this.ownerdraw = { painter: 'titlecount', data: { last: at2 - at1,
                                    from: this.from, name: name, hitcount: hitcount, caption: caption, ptk: ptk, tofind: tofind, items: items } };
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, ptk.parseQuery(tofind)];
                    case 1:
                        _c = _d.sent(), _c[0], postings = _c[1];
                        //no ranking yet
                        for (i = 0; i < postings.length; i++) {
                            pl = plTrim(postings[i], sectionfrom, sectionto);
                            pllines = plContain(pl, ptk.inverted.tokenlinepos)[0];
                            for (j = 0; j < pllines.length; j++) { //count hit in each chunk
                                at = bsearchNumber(chunktag.linepos, pllines[j]);
                                if (!chunkcountobj[at])
                                    chunkcountobj[at] = 0;
                                chunkcountobj[at]++;
                                hitcount++;
                            }
                        }
                        till = this.till;
                        from = this.from;
                        if (till == -1)
                            till = this.from + ACTIONPAGESIZE;
                        arr = fromObj(chunkcountobj, function (a, b) { return [parseInt(a), b]; }).sort(function (a, b) { return b[1] - a[1]; });
                        this.last = arr.length;
                        if (till >= arr.length)
                            till = arr.length;
                        arr = arr.slice(from, till);
                        items = arr.map(function (it) {
                            var count = it[1];
                            var chunk = it[0];
                            var ck = ptk.nearestChunk(chunktag.linepos[chunk]);
                            var address = makeChunkAddress(ck);
                            return { id: ck.id, count: count, address: address, caption: ck.caption, title: ck.caption };
                        });
                        this.first = 0;
                        this.ownerdraw = { painter: 'titlecount', data: { last: this.last,
                                from: this.from, name: name, hitcount: hitcount, caption: caption, ptk: ptk, tofind: tofind, items: items } };
                        return [2 /*return*/];
                }
            });
        });
    };
    return TitleCountAction;
}(Action));

var QueryAction = /** @class */ (function (_super) {
    __extends(QueryAction, _super);
    function QueryAction(addr, depth) {
        if (depth === void 0) { depth = 0; }
        return _super.call(this, addr, depth) || this;
    }
    QueryAction.prototype.lineOf = function (idx) {
        if (idx >= this.res.length)
            return -1;
        return this.res[idx].line;
    };
    QueryAction.prototype.searchLexicon = function (ptk, name, tofind) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var lexicon = ptk.primarykeys[name];
        var matcher = lexicon.enumMiddle;
        if (tofind[0] == '$') {
            matcher = lexicon.enumStart;
            tofind = tofind.slice(1);
        }
        else if (tofind[tofind.length - 1] == '$') { //regular expression style
            matcher = lexicon.enumEnd;
            tofind = tofind.slice(0, tofind.length - 1);
        }
        var items = matcher.call(lexicon, tofind);
        var tagname = (_b = (_a = ptk.columns[name]) === null || _a === void 0 ? void 0 : _a.attrs) === null || _b === void 0 ? void 0 : _b.tagname;
        var foreign = ((_d = (_c = ptk.columns[name]) === null || _c === void 0 ? void 0 : _c.attrs) === null || _d === void 0 ? void 0 : _d.foreign) || ((_e = ptk.columns[name]) === null || _e === void 0 ? void 0 : _e.fieldnames[0]);
        var backref = (_g = (_f = ptk.columns[name]) === null || _f === void 0 ? void 0 : _f.attrs) === null || _g === void 0 ? void 0 : _g.backref;
        this.last = 1;
        this.till = 1;
        var caption = (_h = ptk.columns[name]) === null || _h === void 0 ? void 0 : _h.caption;
        this.ownerdraw = { painter: 'queryresult',
            data: { querytype: 'BME', name: name, caption: caption, ptk: ptk, tagname: tagname, foreign: foreign, tofind: tofind, items: items, backref: backref, lexicon: lexicon } };
    };
    QueryAction.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ptk, i, _a, name_1, tofind, _b, column, field, out, items, caption;
            return __generator(this, function (_c) {
                ptk = usePtk(this.ptkname);
                for (i = 0; i < this.act.length; i++) {
                    _a = this.act[i], name_1 = _a.name, tofind = _a.tofind;
                    if (ptk.primarykeys[name_1])
                        return [2 /*return*/, this.searchLexicon(ptk, name_1, tofind)];
                    else if (name_1.indexOf(COLUMNFIELDSEP)) { //column , field
                        _b = name_1.split(COLUMNFIELDSEP), column = _b[0], field = _b[1];
                        out = ptk.searchColumnField(column, field, tofind);
                        this.last = out.contain.length;
                        this.till = this.from + 5;
                        if (this.till + 1 >= this.last)
                            this.till = this.last - 1;
                        items = out.contain.slice(this.from, this.till).map(function (it) {
                            return it;
                        });
                        caption = field;
                        this.ownerdraw = { painter: 'queryresult', data: { ptk: ptk, caption: caption, column: column, field: field, tofind: tofind, items: items, from: this.from, last: this.last } };
                    }
                }
                return [2 /*return*/];
            });
        });
    };
    return QueryAction;
}(Action));

var makeExcerptAddress = function (ptkname, section, tofind, chunk) {
    if (chunk === void 0) { chunk = ''; }
    return EXCERPTACTIONPREFIX + section + (chunk ? ('.' + chunk) : '') + '=' + tofind; //
};
var createAction = function (addr, depth) {
    if (depth === void 0) { depth = 0; }
    var at = addr.action.indexOf('=');
    var atype = addr.action.slice(0, 1);
    if (at > 0) {
        if (atype == EXCERPTACTIONPREFIX) {
            if (~addr.action.indexOf(OWNERDRAWPREFIX)) {
                return new BooleanExcerptAction(addr, depth);
            }
            else if (~addr.action.indexOf(TITLECOUNTACTIONPREFIX)) {
                return new ApproxAction(addr, depth);
            }
            else {
                return new ExcerptAction(addr, depth);
            }
        }
        else if (atype == TITLECOUNTACTIONPREFIX) {
            return new TitleCountAction(addr, depth);
        }
        else {
            return new QueryAction(addr, depth);
        }
    }
    else {
        if (atype == OWNERDRAWPREFIX) { //ownerdraw
            return new CustomAction(addr, depth);
        }
        else if (atype == GUIDEACTIONPREFIX) {
            return new GuideAction(addr, depth);
        }
        else {
            return new RangeAction(addr, depth);
        }
    }
};
var createNestingAction = function (address, ctx) {
    var addr = parseAddress(address);
    if (!addr)
        return null;
    //補足文字型可省略的信息
    if (addr.action)
        ctx.actions[ctx.depth] = addr.action;
    if (addr.ptkname)
        ctx.ptknames[ctx.depth] = addr.ptkname;
    addr.action = addr.action || ctx.actions[ctx.depth] || ctx.same_level_action;
    addr.ptkname = addr.ptkname || ctx.ptknames[ctx.depth] || ctx.same_level_ptkname;
    ctx.same_level_ptkname = addr.ptkname;
    ctx.same_level_action = addr.action;
    if (addr.from && addr.till && addr.till < addr.from)
        addr.till = addr.from;
    return createAction(addr, ctx.depth);
};

var LVA$1 = /** @class */ (function () {
    function LVA(addresses) {
        if (addresses === void 0) { addresses = ''; }
        this._divisions = LVA.parse(addresses);
        this.load = load;
        this.loadedItems = []; // cache the loaded items
    }
    LVA.prototype.divisions = function () {
        return this._divisions;
    };
    LVA.prototype.getNode = function (idx) {
        return this._divisions[idx];
    };
    LVA.prototype.remove = function (idx) {
        var _a, _b, _c;
        if (typeof idx !== 'number') {
            idx = this._divisions.indexOf(idx);
        }
        if (!this._divisions.length)
            return;
        if (this._divisions.length == 1) {
            this._divisions = [];
            return this;
        }
        var depth = (_a = this._divisions[idx]) === null || _a === void 0 ? void 0 : _a.depth;
        var next = idx + 1;
        var nextdepth = (_b = this._divisions[next]) === null || _b === void 0 ? void 0 : _b.depth;
        while (next < this._divisions.length && nextdepth > depth) {
            next++;
            // if (!this._divisions[next]) break;
            nextdepth = (_c = this._divisions[next]) === null || _c === void 0 ? void 0 : _c.depth;
        }
        if (next - idx > 1) { //delete all child
            this._divisions.splice(idx + 1, next - idx);
            this._combine();
        }
        this._divisions.splice(idx, 1);
        this._combine();
        return this;
    };
    LVA.stringify = function (lvnode, hideptkname, hideaction) {
        if (hideptkname === void 0) { hideptkname = false; }
        if (hideaction === void 0) { hideaction = false; }
        lvnode.depth; var action = lvnode.action, from = lvnode.from, till = lvnode.till, highlightline = lvnode.highlightline, ptkname = lvnode.ptkname;
        return ((ptkname && (!action || !hideptkname)) ? ptkname + ':' : '')
            + (hideaction ? '' : action) + (from ? '>' + from : '') + (till > 0 ? '<' + till : '')
            + (highlightline > -1 ? ':' + highlightline : '');
    };
    LVA.prototype.stringify = function (lvnode, hideptkname, hideaction) {
        if (hideptkname === void 0) { hideptkname = false; }
        if (hideaction === void 0) { hideaction = false; }
        if (typeof lvnode == 'number')
            lvnode = this.divisions(lvnode);
        if (!lvnode)
            return this.serialize();
        return LVA.stringify(lvnode, hideptkname, hideaction);
    };
    LVA.prototype.firstChild = function (idx) {
        if (idx < this._divisions.length - 1)
            return;
        var firstchild = this._divisions[idx + 1];
        if (firstchild && firstchild.depth == this._divisions[idx].depth + 1) {
            return firstchild;
        }
    };
    LVA.prototype.serialize = function () {
        var _a;
        if (!this._divisions && !this._divisions.length)
            return '';
        var prevdepth = 0, same_level_ptkname = '', activeptkname;
        var firstdepth = ((_a = this._divisions[0]) === null || _a === void 0 ? void 0 : _a.depth) || 0;
        var out = [], ptknames = [], actions = [];
        for (var i = 0; i < this._divisions.length; i++) {
            var _b = this._divisions[i], depth = _b.depth; _b.from; _b.till; var ptkname = _b.ptkname, action = _b.action;
            if (depth > prevdepth)
                out.push('(');
            else if (prevdepth > depth)
                out.push(')');
            if (ptkname) {
                activeptkname = ptkname;
                ptknames[depth] = ptkname;
            }
            activeptkname = activeptkname || ptknames[depth] || same_level_ptkname;
            out.push(LVA.stringify(this._divisions[i], activeptkname == same_level_ptkname, action == actions[depth]));
            if (action)
                actions[depth] = action;
            same_level_ptkname = activeptkname;
            prevdepth = depth;
        }
        while (prevdepth > firstdepth) {
            prevdepth--;
            out.push(')');
        }
        return out.join('^').replace(/\^?([\(\)])\^?/g, '$1').replace(/\++/g, '^');
    };
    LVA.prototype.removeSameAction = function (newaddr, from, depth) {
        if (from === void 0) { from = 0; }
        if (depth === void 0) { depth = -1; }
        var p = from;
        while (p < this._divisions.length && this._divisions[p].depth > depth) {
            if (sameAddress(this._divisions[p], newaddr) && newaddr.action) {
                this._divisions.splice(p, 1); //remove same
                return p;
            }
            p++;
        }
        return -1;
    };
    LVA.prototype.findAction = function (action) {
        for (var i = 0; i < this._divisions.length; i++) {
            if (this._divisions[i].action == action)
                return i;
        }
        return -1;
    };
    LVA.prototype.canless = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        return division.till - division.from > ACTIONPAGESIZE;
    };
    LVA.prototype.canmore = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        this.getViewPageSize(division);
        return (division.till > 0 ? division.till : 0) < division.last - division.first;
    };
    LVA.prototype.cannext = function (idx) {
        var _a;
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        if (!division.pagable && !((_a = division.ownerdraw) === null || _a === void 0 ? void 0 : _a.pagable))
            return;
        var pagesize = this.getViewPageSize(division);
        return division.last - division.first > pagesize;
    };
    LVA.prototype.canprev = function (idx) {
        var _a;
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        if (!division.pagable && !((_a = division.ownerdraw) === null || _a === void 0 ? void 0 : _a.pagable))
            return;
        return (division.from > 0);
    };
    LVA.prototype.canpromote = function (idx) {
        if (idx < 1)
            return;
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        if (division.depth > 0)
            return true;
    };
    LVA.prototype.promote = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return this;
        if (!this.canpromote(idx))
            return this;
        division.depth = 0;
        this._divisions.splice(idx, 1);
        this._divisions.unshift(division);
        this._combine();
        return this;
    };
    LVA.prototype.less = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return this;
        division.till -= ACTIONPAGESIZE;
        if (division.till - ACTIONPAGESIZE < division.from)
            division.till = division.from + ACTIONPAGESIZE;
        return this;
    };
    LVA.prototype.more = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return this;
        var linecount = division.last - division.first;
        var till = division.till;
        if (till == -1)
            division.till = division.from + ACTIONPAGESIZE;
        else
            division.till += ACTIONPAGESIZE;
        if (division.till > linecount)
            division.till = linecount;
        return this;
    };
    LVA.prototype.getViewPageSize = function (division) {
        var pagesize = division.till - division.from;
        var linecount = division.last - division.first;
        if (pagesize < ACTIONPAGESIZE) {
            pagesize = ACTIONPAGESIZE;
            if (pagesize > linecount) {
                pagesize = division.last - division.first;
            }
        }
        return pagesize;
    };
    LVA.prototype.removeChildren = function (idx) {
        var _a, _b, _c;
        var depth = (_a = this._divisions[idx]) === null || _a === void 0 ? void 0 : _a.depth;
        var action = (_b = this._divisions[idx]) === null || _b === void 0 ? void 0 : _b.action;
        var ptkname = (_c = this._divisions[idx]) === null || _c === void 0 ? void 0 : _c.ptkname;
        for (var i = idx + 1; i < this._divisions.length; i++) {
            if (this._divisions[i].depth > depth) {
                this._divisions[i] = null;
            }
            else if (this._divisions[i].action !== action
                || this._divisions[i].ptkname !== ptkname)
                break;
        }
        this._divisions = this._divisions.filter(function (it) { return !!it; });
        this._combine();
    };
    LVA.prototype.next = function (idx, nline) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        this.removeChildren(idx);
        var linecount = division.last - division.first;
        var pagesize = this.getViewPageSize(division);
        if (linecount <= pagesize || linecount <= ACTIONPAGESIZE)
            return this;
        if (division.till == -1)
            division.till = division.from + ACTIONPAGESIZE;
        division.from += (nline || pagesize);
        if (division.from < 0)
            division.from = 0;
        division.till = division.from + pagesize;
        if (division.from + 1 > linecount)
            division.from = linecount - 1;
        if (division.till > linecount)
            division.till = linecount;
        return this;
    };
    LVA.prototype.end = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        var linecount = division.last - division.first;
        var pagesize = this.getViewPageSize(division);
        division.till = linecount;
        if (linecount > pagesize) {
            division.from = division.till - pagesize;
        }
        else {
            division.from = 0;
        }
        return this;
    };
    LVA.prototype.start = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        this.removeChildren(idx);
        var linecount = division.last - division.first;
        var pagesize = this.getViewPageSize(division);
        if (linecount <= pagesize || linecount <= ACTIONPAGESIZE)
            return this;
        division.from = 0;
        division.till = pagesize;
        if (division.till > linecount)
            division.till = linecount;
        return this;
    };
    LVA.prototype.prev = function (idx, pgsize) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        var pagesize = this.getViewPageSize(division);
        division.from -= (pgsize || pagesize);
        if (division.from < 0)
            division.from = 0;
        division.till = division.from + pagesize;
        return this;
    };
    LVA.prototype.top = function (idx) {
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return;
        var pagesize = division.till - division.from;
        division.from = 0;
        division.till = pagesize;
        return this;
    };
    LVA.prototype.setFrom = function (idx, from) {
        var division = this._divisions[idx];
        if (!division)
            return;
        division.from = from;
        if (division.till !== -1)
            division.till = division.from + ACTIONPAGESIZE;
        if (division.till > division.last - division.first)
            division.till = division.last - division.first;
        return this;
    };
    LVA.prototype.insert = function (addr, idx) {
        var _a, _b;
        if (idx === void 0) { idx = 0; }
        var newaddr = parseAddress(addr);
        if (!newaddr)
            return this;
        //to pass the same address check
        newaddr.ptkname = newaddr.ptkname || ((_a = this._divisions[idx]) === null || _a === void 0 ? void 0 : _a.ptkname) || ((_b = this._divisions[idx - 1]) === null || _b === void 0 ? void 0 : _b.ptkname);
        var removeat = this.removeSameAction(newaddr);
        if (removeat > -1) { // move to top
            if (removeat !== idx)
                this._divisions.splice(idx, 0, newaddr);
        }
        else { //new addr , just append at the end
            this._divisions.splice(idx, 0, newaddr);
        }
        return this;
    };
    LVA.prototype.changeAction = function (newaction, idx, reset) {
        if (idx === void 0) { idx = 0; }
        if (reset === void 0) { reset = false; }
        var division = typeof idx == 'number' ? this._divisions[idx] : idx;
        if (!division)
            return this;
        if (reset) {
            division.from = 0;
            division.till = ACTIONPAGESIZE;
        }
        division.action = newaction;
        return this;
    };
    LVA.prototype.dig = function (digaddr, idx, nline) {
        var _a;
        if (idx === void 0) { idx = 0; }
        if (nline === void 0) { nline = 0; }
        var newaddr = parseAddress(digaddr);
        if (!newaddr)
            return this;
        newaddr.ptkname = newaddr.ptkname || this._divisions[idx].ptkname;
        createAction(newaddr, 0);
        if (!this._divisions || !this._divisions.length) {
            this._divisions.push(newaddr);
            return this;
        }
        if (sameAddress(this._divisions[idx], newaddr))
            return this; //prevent recursive dig
        if (!this._divisions[idx].diggable) { //
            var removeat = this.removeSameAction(newaddr);
            if (removeat == -1 || removeat > idx) { //bring to top
                this._divisions.splice(idx, 0, newaddr);
            }
            return;
        }
        var depth = this._divisions[idx].depth;
        if (this._divisions.length > 1 && idx < this._divisions.length - 1 //reuse children
            && this._divisions[idx + 1].depth == depth + 1) {
            var removeat = this.removeSameAction(newaddr, idx + 1, depth);
            if (~removeat && idx + 1 == removeat) { //remove the first child
                this._combine();
                return this;
            }
            newaddr.depth = this._divisions[idx].depth + 1;
            this._divisions.splice(idx + 1, 0, newaddr);
            return this;
        }
        var addr = this._divisions[idx];
        var splitat = addr.from + (nline || 0);
        var breakleft, breakright;
        var toinsert = parseAddress(digaddr);
        if ((addr.from && addr.till && addr.till == addr.from) || splitat + 1 >= (addr.last - addr.first)) { //one line only, no breakright
            breakleft = addr;
            if (addr.action == toinsert.action) { //delete
                this._divisions.splice(idx, 1);
                return this;
            }
        }
        else {
            breakleft = Object.assign({}, addr, { till: splitat + 1 });
            breakright = Object.assign({}, addr, { from: splitat + 1 });
        }
        toinsert.depth = breakleft.depth + 1;
        var out = [breakleft, toinsert];
        if (breakright)
            out.push(breakright);
        (_a = this._divisions).splice.apply(_a, __spreadArray([idx, 1], out, false));
        return this;
    };
    LVA.prototype._combine = function () {
        var out = [];
        var i = 0;
        while (i < this._divisions.length) {
            var _a = this._divisions[i], ptkname = _a.ptkname; _a.from; var till = _a.till, action = _a.action, depth = _a.depth;
            var next = this._divisions[i + 1];
            out.push(this._divisions[i]);
            while (i < this._divisions.length && next && next.ptkname == ptkname && next.action == action
                && next.depth == depth && next.from == till) {
                this._divisions[i].till = next.till;
                i++;
                next = this._divisions[i + 1];
            }
            i++;
        }
        this._divisions = out;
        return this;
    };
    LVA.parse = function (addresses) {
        if (!addresses)
            return [];
        var expr = parseLisp(addresses);
        var ctx = { same_level_ptkname: '', same_level_action: '', ptknames: [], actions: [] };
        var divisions = expr.map(function (_a) {
            var depth = _a[0], action = _a[1];
            ctx.depth = depth;
            return createNestingAction(action, ctx);
        }).filter(function (it) { return !!it; });
        return divisions;
    };
    return LVA;
}());

var getOfftextLineClass = function (ptk, offtext, attr) {
    var _a;
    var out = [];
    if (!((_a = offtext === null || offtext === void 0 ? void 0 : offtext.tags) === null || _a === void 0 ? void 0 : _a.length))
        return [];
    var tags = offtext.tags;
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var def = ptk.defines[tag.name];
        if (!def)
            continue;
        var value = def.attrs[attr];
        if (typeof value !== 'undefined') {
            var backref = def.attrs.backref;
            //attr=value 在 ^:tag 中定義
            //strange , need to -1 other wise cannot render char at eol
            out.push({ tagname: tag.name,
                attrs: tag.attrs, defattrs: def.attrs, id: tag.attrs.id, ptk: ptk, backref: backref, attr: attr, value: value, choff: tag.choff });
        }
    }
    // out.length&&console.log(out)
    return out;
};

var listwords = function (text, lexicon) {
    var line = text.first(), linecount = 0;
    var patterns = {};
    while (line || line == '') {
        var i = 0;
        while (i < line.length) {
            var cp = line.charCodeAt(i);
            if (cp >= 0xdc800 && cp <= 0xdfff)
                i++;
            var matches = lexicon.matchLongest(line.slice(i));
            if (matches.length) {
                matches.forEach(function (m) { return incObj(patterns, m[0]); });
                // console.log( matches )
            }
            i++;
        }
        line = text.next();
        linecount++;
        //if (linecount>10000) break;
        if (linecount % 1024 == 0)
            process.stdout.write('\r' + linecount + '/' + text.len() + '   ');
    }
    var arr = fromObj(patterns, true).filter(function (it) { return !!it[0]; });
    return arr;
};

var lexiconUnion = function (lexicons) {
    if (!lexicons || lexicons.length < 2)
        return lexicons;
    var out = lexicons[0];
    for (var i = 1; i < lexicons.length; i++) {
        out = out.concat(lexicons[i]);
    }
    return unique(out);
};
var lexiconIntersect = function (lexicons) {
    if (!lexicons || lexicons.length < 2)
        return lexicons;
    lexicons.sort(function (a, b) { return b.length - a.length; }); //save some looping
    var out = unique(lexicons[0]);
    for (var i = 1; i < lexicons.length; i++) {
        var arr = unique(lexicons[i]);
        var res = [];
        for (var j = 0; j < arr.length; j++) {
            var at = bsearch(out, arr[j]);
            if (out[at] == arr[j])
                res.push(arr[j]);
        }
        out = res;
    }
    return out.sort(alphabetically);
};
var lexiconXor = function (lexicons) {
    if (!lexicons || lexicons.length < 2)
        return lexicons;
    var intersect = lexiconIntersect(lexicons);
    var out = [];
    for (var i = 0; i < lexicons.length; i++) {
        var arr = unique(lexicons[i]);
        var res = [];
        for (var j = 0; j < arr.length; j++) {
            var at = bsearch(intersect, arr[j]);
            if (intersect[at] !== arr[j]) {
                res.push(arr[j]);
            }
        }
        out = out.concat(res);
    }
    return out.sort(alphabetically);
};

var guessEntry = function (sentence, values) {
    var at = sentence.indexOf('^');
    var textbefore = '';
    if (~at) {
        textbefore = sentence.slice(0, at);
        sentence = sentence.slice(at + 1);
    }
    //  如是^我聞 如是我^聞 如^是我聞 
    //  點任何一字都可以找到
    for (var j = 0; j <= textbefore.length; j++) {
        for (var i = 0; i < values.length; i++) {
            var tf = (textbefore.slice(textbefore.length - j) + sentence).slice(0, values[i].length);
            if (tf == values[i] && j < values[i].length) { //必須是在詞之中
                return values[i];
            }
        }
    }
    var chars = splitUTF32Char(sentence);
    return chars[0];
};

var PINSEP = '>', BACKPINSEP = '<';
var posBackwardPin = function (linetext, x, _a) {
    var wholeword = _a.wholeword, cjk = _a.cjk;
    if (x < 1)
        return '';
    var len = 2, occur = 0; //start from 2 char for better looking of foot note
    if (cjk)
        len = 1;
    if (wholeword) {
        while (x > len && linetext.substr(x - len, 1).match(/[\dA-Za-z]/))
            len++;
        if (len > 2)
            len--;
    }
    var at = linetext.indexOf(linetext.substr(x - len, len));
    // while (at!==x-len && x) {
    //     if (!wholeword && linetext.substr(x-len,len).trim().length>4) break;
    //     if (wholeword && !linetext.substr(x-len,1).match(/[\dA-Za-z]/) ) break;
    //     if (cjk && !linetext.substr(x-len,1).match(/[\u3400-\u9fff]/) ) break;
    //     len++;
    //     at=linetext.indexOf(linetext.substr(x-len,len));
    // }
    // if (at!==x-len && linetext.charCodeAt(x)>0xff) len=2;
    while (at !== x - len && at > -1) {
        occur++;
        at = linetext.indexOf(linetext.substr(x - len, len), at + 1);
    }
    var pin = linetext.substring(x - len, x);
    var pass = at === x - len && linetext[x - len] !== BACKPINSEP && linetext.charCodeAt(x - len) >= 0x20;
    return pass ? (pin + (occur ? BACKPINSEP + occur : '')) : null;
};
var pinPos = function (_linetext, x, opts) {
    if (opts === void 0) { opts = {}; }
    var backward = opts.backward;
    var wholeword = opts.wholeword;
    var offtext = opts.offtext;
    var linetext = _linetext;
    var marker = opts.marker || '⚓';
    if (offtext) {
        linetext = linetext.substring(0, x) + marker + linetext.substring(x);
        linetext = parseOfftext(linetext)[0];
        x = linetext.indexOf(marker);
        linetext = linetext.substring(0, x) + linetext.substring(x + 1);
    }
    var cjk = opts.cjk;
    var pin = '';
    if (linetext.charCodeAt(x) < 0x20 || linetext[x] === PINSEP) {
        // console.log('cannot pin separator or control chars')
        return null;
    }
    if (x > linetext.length) {
        // console.log('beyond string boundary',x,linetext.length,linetext.substr(0,30));
        return null;
    }
    if (backward) {
        pin = posBackwardPin(linetext, x, { wholeword: wholeword, cjk: cjk });
    }
    if (pin)
        return pin;
    var len = 4, occur = 0;
    if (cjk)
        len = 1;
    var at = linetext.indexOf(linetext.substr(x, len));
    while (x + len < linetext.length && x > at) {
        if (!wholeword && linetext.substring(x, len).trim().length > 2)
            break;
        if (wholeword && len > 2 && !linetext.substr(x + len, 1).match(/[\dA-Za-zñṅḍṭṃṇāūḷī]/))
            break;
        len++;
        at = linetext.indexOf(linetext.substr(x, len));
    }
    // console.log(linetext.substr(x,len),len,linetext.substr(x+len,1), linetext.substr(x,len+1))
    if (at !== x && linetext.charCodeAt(x) > 0xff
        && linetext.charCodeAt(x + 1) > 0xff && cjk) {
        len = 2; //shorter pin for non-ascii
        at = linetext.indexOf(linetext.substr(x, len));
    }
    // if (at!==x && linetext.substr(x,len).trim().length==0) len=; 
    //如果是很長的空白(可能是一連串標點)，必須弄短，否則會找不到
    while (at !== x && at > -1 && at < linetext.length) {
        occur++;
        var newat = linetext.indexOf(linetext.substr(x, len), at + len - 1);
        if (at == -1 || newat == at)
            break;
        at = newat;
    }
    return (at === x) ? linetext.substr(x, len) + (occur ? PINSEP + occur : '') : null;
};
var posPin = function (linetext, pin) {
    if (typeof pin === 'number') {
        if (pin < 0 || pin > linetext.length) {
            console.error('error pin', pin, linetext);
            return 0;
        }
        return pin;
    }
    if (pin[0] === PINSEP) {
        pin = pin.substr(1);
        return linetext.indexOf(pin) + pin.length;
    }
    var m = pin.match(/:(\d+)$/);
    var mb = pin.match(/^(\d+):/);
    var occur = 0, backward = 0;
    if (mb) {
        occur = parseInt(mb[1]);
        pin = pin.substr(PINSEP.length + mb[1].length);
        backward = pin.length;
    }
    else if (m) {
        occur = parseInt(pin.substr(pin.length - m[1].length));
        pin = pin.substr(0, pin.length - m[1].length - 1);
    }
    var at = linetext.indexOf(pin);
    while (occur) {
        at = linetext.indexOf(pin, at + pin.length - 1); //see line 77 , 至少要2個中文字。
        occur--;
    }
    if (at == -1)
        return -1; //console.error("cannot pospin",pin,linetext);
    return at + backward;
};
//hook 文鉤 : 以一或兩字表達引文的起訖，不能跨段。
var makeHook = function (linetext, x, w) {
    if (w < 0)
        return '';
    var lead = linetext.substr(x, 2);
    var end = '';
    var occur = 0; //0-base occurance
    var eoccur = 0; //0-base occurance
    if (w > 2) {
        end = linetext.substr(x + w - 2, 2);
    }
    var at = linetext.indexOf(lead);
    while (at > -1 && at < x) {
        at = linetext.indexOf(lead, at + 1);
        occur++;
    }
    if (occur == 0) {
        at = linetext.indexOf(lead.substr(0, 1));
        if (at == x) {
            lead = lead.substr(0, 1); //one char is enough
            if (!end)
                end = linetext.substr(x + w - 1, 1);
        }
    }
    var hook = lead + (occur ? PINSEP + occur : '');
    if (end) {
        var at_1 = linetext.indexOf(end, x);
        while (at_1 > -1 && at_1 < x) {
            at_1 = linetext.indexOf(end, at_1 + 1);
            eoccur++;
        }
        if (at_1 > -1) {
            if (eoccur == 0 && linetext.indexOf(end.substr(1), x) == at_1 + 1)
                end = end.substr(1);
            hook += '/' + end + (eoccur ? PINSEP + eoccur : '');
        }
        else {
            end = '';
        }
    }
    return hook;
};
var parseHook = function (str_arr, linetext, y) {
    if (y === void 0) { y = 0; }
    if (!str_arr)
        return null;
    var _a = Array.isArray(str_arr) ? str_arr : str_arr.split(PATHSEP), L = _a[0], E = _a[1];
    var _b = (L || '').split(PINSEP), s = _b[0], nos = _b[1];
    var _c = (E || '').split(PINSEP), e = _c[0], noe = _c[1];
    nos = parseInt(nos) || 0;
    noe = parseInt(noe) || 0;
    var x = 0;
    x = linetext.indexOf(s);
    var n = nos;
    while (n) {
        x = linetext.indexOf(s, x + 1);
        n--;
    }
    var x2 = linetext.indexOf(e, x);
    n = noe;
    while (n) {
        x2 = linetext.indexOf(s, x2 + 1);
        n--;
    }
    return { y: y, x: x, w: x2 - x + e.length, s: s, nos: nos, e: e, noe: noe };
};

var spacify = function (str) {
    return str.replace(OFFTAG_REGEX_G, function (m, tagname, attr) {
        return " ".repeat(tagname.length + (attr ? attr.length : 0) + 1);
    }).replace(/[^a-zA-Z\u3400-\u9FFF\uD800-\uDFFF]/g, ' '); //“‘ include ?
};
var removeHeader = function (str) {
    return str.replace(/^(.+)(\^n[\-\d]+)/, function (m, rm, n) { return " ".repeat(rm.length) + n; })
        .replace(/(\([^\)]+\))/g, function (m, m1) { return " ".repeat(m1.length); })
        .replace(/^sz/g, '   ').replace(/^\^n/g, '  ');
};
var removeBold = function (str) {
    return str.replace(/\^b([^\]]+?)\]/g, "  $1 ");
};
var breakLine = function (str, breaker) {
    var substrings = [], breakpos = [];
    var prev = 0;
    str.replace(breaker, function (m, m1, idx) {
        if (prev)
            breakpos.push(prev);
        substrings.push(str.substring(prev, idx + m1.length));
        prev = idx + m1.length;
    });
    if (prev < str.length) {
        if (prev)
            breakpos.push(prev);
        substrings.push(str.substr(prev));
    }
    return { substrings: substrings, breakpos: breakpos };
};
var moveFootnoteToTail = function (str) { return str.replace(/\n( *\^f\d+ *)/g, "$1\n"); };
var autoENBreak = function (line) {
    line = line.replace(/([^\dA-Z])([:\!\?\.”]+[:\!\?\.”’〕\)]* ?)/g, function (m, alpha, m1) { return alpha + m1 + '\n'; })
        .replace(/([^\dA-Z])([:\?\.”〕\)]+)(\^f\d+)/g, function (m, alpha, m1, m2) { return alpha + m1 + m2 + '\n'; });
    line = moveFootnoteToTail(line);
    line = line.replace(/\n\]/g, ']\n');
    return line.split('\n');
};
var autoBreak = function (lines, breaker) {
    if (breaker === void 0) { breaker = "([?!।॥;–—] +)"; }
    if (typeof lines === 'string')
        lines = [lines];
    var sentences = [], breakpos = [];
    if (typeof breaker === 'string') {
        breaker = new RegExp(breaker, "g");
    }
    for (var i = 0; i < lines.length; i++) {
        var res = breakLine(lines[i], breaker);
        sentences.push.apply(sentences, res.substrings);
        breakpos.push(res.breakpos);
    }
    return { sentences: sentences, breakpos: breakpos };
};
var paragraphSimilarity = function (p1, p2) {
    var P1 = p1.map(function (l) { return l.replace(/ +/g, '').trim(); }).filter(function (it) { return !!it; });
    var P2 = p2.map(function (l) { return l.replace(/ +/g, '').trim(); }).filter(function (it) { return !!it; });
    var p1len = P1.reduce(function (p, v) { return p + v.length; }, 0);
    var p2len = P2.reduce(function (p, v) { return p + v.length; }, 0);
    var ratio1 = P1.map(function (l) { return l.length / p1len || 0; });
    var ratio2 = P2.map(function (l) { return l.length / p2len || 0; });
    var accdiff = P1.reduce(function (p, v, i) { return p += Math.abs(ratio1[i] - ratio2[i]) || 0; }, 0);
    return accdiff;
};
var breakSentence = function (arr, breakpos, paraprefix) {
    if (paraprefix === void 0) { paraprefix = ''; }
    var out = [];
    for (var i = 0; i < breakpos.length; i++) {
        var str = arr[i];
        var prev = 0;
        var prefix = paraprefix;
        for (var j = 0; j < breakpos[i].length; j++) {
            var bp = breakpos[i][j];
            var sub = str.substring(prev, bp);
            out.push((i ? prefix : '') + sub);
            prev = bp;
            prefix = '';
        }
        if (prev < str.length - 1) {
            out.push(str.substr(prev));
        }
    }
    return out;
};
//ensure array length
var ensureArrayLength = function (arr, length, marker) {
    if (marker === void 0) { marker = '<>'; }
    if (length > arr.length) {
        while (length > arr.length) {
            arr.push(marker);
        }
    }
    else if (length < arr.length) {
        while (arr.length && length < arr.length) {
            var last = arr.pop();
            arr[arr.length - 1] += marker + last;
        }
    }
    return arr;
};
/* make sure cluster has ^n*/
var ensureChunkHasPN = function (lines) {
    var join = '';
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var t = lines[i];
        if (t.indexOf('^n') == -1) {
            join += t;
        }
        else {
            if (join)
                console.log(join.length, join.substr(0, 29));
            out.push(join + t);
            join = '';
        }
    }
    return out;
};
//find out shorted lead to reach pos
var MAXWIDTH = 5;
var shortestLead = function (line, pos, from) {
    var lead, at, width = 2; //try from 2 chars, up to MAXWIDTH
    while (at !== pos) {
        lead = line.substr(pos, width);
        at = line.indexOf(lead, from);
        if (at == -1) {
            throw "cannot find lead at " + pos + 'lead ' + lead;
        }
        if (at === pos)
            return lead;
        var ch = line.charAt(pos + width);
        if (width > MAXWIDTH || ch === ',' || ch === '^') { //try occur
            var occur = 0;
            while (at !== pos) {
                at = line.indexOf(lead, at + 1);
                occur++;
            }
            lead += '+' + occur;
            break;
        }
        else {
            width++;
        }
    }
    return lead;
};
/* convert sentence break of a paragraph to hooks, output one line per paragraph , separated by tab */
var hookFromParaLines = function (paralines) {
    var bp = [], breakpos = [], out = [];
    var p = 0;
    for (var i = 0; i < paralines.length; i++) {
        var l = paralines[i];
        if (l.substr(0, 3) === '^n ') {
            breakpos.push(bp);
            bp = [];
            p = 0;
        }
        else {
            if (p)
                bp.push(p);
        }
        p += l.length;
    }
    breakpos.push(bp);
    var orilines = paralines.join('').replace(/\^n /g, '\n^n ').split('\n');
    for (var i = 0; i < orilines.length; i++) {
        var from = 0, leads = [];
        for (var j = 0; j < breakpos[i].length; j++) {
            var leadword = shortestLead(orilines[i], breakpos[i][j], from);
            from = breakpos[i][j] + 1;
            leads.push(leadword);
        }
        out.push(leads);
    }
    return out;
};
var breakByPin = function (line, pins, id) {
    var prev = 0, out = [], extrabr = 0;
    for (var i = 0; i < pins.length; i++) {
        var pos = 0, pin = pins[i];
        if (!pin) { //just insert a blank line
            extrabr++;
            continue;
        }
        pos = posPin(line, pin);
        if (pos == -1) {
            console.log('pin error', id, 'pin', pin, '\nline', line);
            pos = prev;
        }
        out.push(line.substring(prev, pos));
        while (extrabr > 0) {
            extrabr--;
            out.push('');
        }
        if (pos < prev) {
            console.log('id', id, '\npin', pin, 'pos', pos, 'text', line.substring(pos, pos + 10), '\nprev', prev, 'text', line.substring(prev, prev + 10), '\npins', pins);
            throw "pin pos not in order";
        }
        prev = pos;
    }
    out.push(line.substring(prev));
    if (pins.filter(function (it) { return !!it; }) == 0)
        extrabr--; //無釘文的情況，每個tab算一個空行，而不是釘文分隔符的語意(因pins數=tab數+1)
    while (extrabr > 0) {
        extrabr--;
        out.push('');
    }
    return out;
};
//remove the sentence break of a paragraph lines (sub paragraph starts with ^n )
var removeSentenceBreak = function (paralines) {
    var combined = paralines.join('').replace(/\^n /g, "\n^n ").split('\n');
    return combined;
};
//make sure each lines is paranum
var removeSubPara = function (paralines) {
    var joined = '';
    var out = [];
    for (var i = 0; i < paralines.length; i++) {
        if (paralines[i].match(/\^n[\d\-]+/)) {
            if (joined && joined.match(/\^n[\-\d]+/)) {
                out.push(joined);
                joined = '';
            }
        }
        joined += paralines[i];
    }
    if (joined)
        out.push(joined);
    return out;
};
var autoEnglishBreak = function (line) {
    return line.replace(/([^ ]{5})([\.\?\!”:\"\–]) ([‘“A-W\"])/g, "$1$2\n $3");
};
var autoSanskritBreak = function (line) {
    return line.replace(/(.{10})([\?\.\!”:\"\–\/\|]+) /g, "$1$2\n ");
};
var autoChineseBreak = function (line) {
    return line.replace(/([！。？][』」”’〕]+)/g, "$1\n")
        .replace(/([^。？；：\d]{4,15})([？；：])/g, "$1$2\n")
        .replace(/([^。？；：\d]{6,})：([〔『「“‘])/g, "$1：\n$2")
        .replace(/([^。？；：\d]{5,15})……乃至……([^。？；：\d]{5,15})/g, "$1……乃至……\n$2")
        .replace(/([^。？；：\d]{5,15})，例如/g, "$1，\n例如")
        .replace(/(\u3400-\u9fff\ud800-\udfff) ([一二三四五六七八九十○]+)§/g, "$1\n $2§")
        .replace(/\n([”’』」〕）｝】》〉]+)/g, "$1")
        .replace(/([」』”’])([『「“‘])/g, "$1\n$2")
        // .replace(/([。！？』」〕]+)\n+/g,"$1\n")
        .replace(/\n([^a-zA-Z\d]{1,8}$)/, "$1") //太短的行
        .replace(/([？。])([^』」”’〕])/g, "$1\n$2")
        .replace(/([^ \d\n\]])(\^n\d)/g, "$1\n$2") //^n  一定在行首
        .replace(/\n+/g, "\n")
        .trimRight();
};
var sentenceRatio = function (lines) {
    if (typeof lines == 'string') {
        lines = lines.split(/\r?\n/);
    }
    var total = lines.reduce(function (p, v) { return p + v.length; }, 0);
    var ratio = lines.map(function (v) { return v.length / total; });
    for (var i = 1; i < ratio.length; i++) {
        ratio[i] += ratio[i - 1];
    }
    return ratio;
};
var afterPN = function (str) {
    var first2 = str.substr(0, 2);
    if (first2 === '^n') {
        if (str.substr(0, 3) === '^n ')
            return str.substr(3);
        else {
            var m_1 = str.match(/^\n[\d\-]/);
            if (m_1) {
                return str.substr(m_1.length);
            }
        }
    }
    var m = str.match(/\^n([\d\-]+ ?)/);
    if (m)
        return str.substr(m.index + m[0].length);
    return str;
};
var beforePN = function (str) {
    var t = afterPN(str);
    return str.substr(0, str.length - t.length);
};
var ensurefirstLineHasPN = function (str) {
    var at = str.indexOf('^n');
    var remain = str.substr(at);
    var headers = str.substr(0, at).replace(/\n/g, '');
    if (headers && headers.indexOf('^h') == -1 && headers.indexOf('^z') == -1) {
        headers = '^h[' + headers + ']';
    }
    // console.log(at,headers,remain.substr(0,10));
    return headers + remain;
};
var diffParanum = function (para, gpara) {
    var GPN = {}, PN = {};
    gpara.map(function (id) {
        if (GPN[id])
            console.log("guided repeated id " + id);
        GPN[id] = true;
    });
    para.map(function (id) {
        if (PN[id])
            console.log("repeated id " + id);
        PN[id] = true;
    });
    var missing = gpara.filter(function (pn) { return !PN[pn]; });
    var extra = para.filter(function (pn) { return !GPN[pn]; });
    return { missing: missing, extra: extra };
};
var guidedBreakLines = function (buf, pins, fn) {
    if (fn === void 0) { fn = ''; }
    if (!pins)
        return buf;
    var lines = buf.split('\n');
    var out = [];
    var pn = '';
    for (var i = 0; i < lines.length && i < pins.length; i++) {
        var m = lines[i].match(/\^n([\d\-]+)/);
        if (m) {
            pn = m[1];
        }
        var id = fn.replace('.xml', '') + '.' + pn;
        if (!pins[i].length) {
            throw "empty pin entry of ".concat(id, ", #").concat(i + 1);
        }
        var Pins = pins[i].split('\t');
        var pinpn = Pins.shift();
        if (m && pn !== pinpn && pinpn[0] !== ':') {
            throw "pin paranum missmatch  ".concat(pn, " != ").concat(pinpn, ", #").concat(i + 1);
        }
        var before = beforePN(lines[i]);
        var sentences = breakByPin(afterPN(lines[i]), Pins, id);
        sentences[0] = before + sentences[0];
        out.push.apply(out, sentences);
    }
    return out.join('\n');
};

var linePN = function (str) { return str.match(/\^n([\d\.\-_]* ?)/); };
var toParagraphs = function (L, opts) {
    if (opts === void 0) { opts = {}; }
    var out = [];
    var lines = [], pid = '';
    var unbreak = opts.unbreak || false;
    var bkpf = (opts.bkid || '').replace(/\..+$/, '');
    for (var i = 0; i < L.length; i++) {
        var line = L[i] || '';
        if (line.indexOf('^n') > -1 && line.substr(0, 3) !== '^n ') {
            var id = line.match(/\^n([\d\-\.]+)/);
            if (!id) {
                console.log('no id', line, i);
            }
            if (pid) {
                out.push([pid, unbreak ? removeSentenceBreak(lines) : lines]);
                lines = [];
            }
            pid = (bkpf ? bkpf + '.' : '') + id[1];
        }
        lines.push(line);
    }
    out.push([pid, unbreak ? removeSentenceBreak(lines) : lines]);
    return out;
};
var fixLoneN = function (lines) {
    var lonen = lines[0].match(/\^n([\d\-]+)$/);
    if (lonen) {
        var n = lines.shift();
        lines[0] = n + lines[0];
    }
    return lines;
};
var autoAlign = function (f1, guide, fn) {
    //prerequisite
    //f1 and f2 need ^n marker
    //f2 has more lines than f1
    //for each paragraph, let f1 has same sentence as f2
    var gpara = toParagraphs(guide);
    var para = toParagraphs(f1);
    if (para.length !== gpara.length) {
        console.log(fn, 'para.length unmatch,', para.length, '< guided', gpara.length);
        console.log(diffParanum(para.map(function (it) { return it[0]; }), gpara.map(function (it) { return it[0]; })));
        return f1;
    }
    var res = [];
    for (var i = 0; i < gpara.length; i++) {
        var rgpara = sentenceRatio(gpara[i][1]);
        var rpara = sentenceRatio(para[i][1]);
        if (gpara[i][0] !== para[i][0]) {
            console.log('paranum diff', gpara[i][0], para[i][0]);
        }
        var aligned = alignParagraph(rpara, rgpara, para[i][0]);
        if (rpara.length < rgpara.length) { //
            while (para[i][1].length < rgpara.length) {
                para[i][1].push(''); //inserted line
            }
            fixLoneN(para[i][1]);
            while (para[i][1].length < gpara[i][1].length) {
                para[i][1].push('');
            }
            res.push.apply(res, para[i][1]);
            continue;
        }
        for (var j = 0; j < aligned.length; j++) {
            var t = (para[i][1][aligned[j]] || '');
            if (t)
                para[i][1][aligned[j]] = '\n' + t;
        }
        var newpara = para[i][1].join('').split('\n');
        fixLoneN(newpara);
        while (newpara.length < gpara[i][1].length) {
            newpara.push('');
        }
        res.push.apply(res, newpara);
    }
    return res;
};
var combineHeaders = function (str) {
    var headers = '', pncount = 0;
    var lines = str.split('\n'), out = [];
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i] || '';
        if (linePN(l)) {
            pncount++;
            out.push(headers + l);
            headers = '';
        }
        else {
            var m = l.match(/\^[zh][\d\[]/);
            if (m || !pncount) {
                if (!m)
                    l = '^h[' + l + ']'; //add generic header
                headers += l;
            }
            else {
                out.push(l);
            }
        }
    }
    //ensure each ^n\d has text followed
    var s = out.join('\n');
    // if (s=s.replace(/(\^n[\d\-]+)\n/g,'$1');
    // console.log(s.substr(0,1300))
    return s;
};
var alignParagraph = function (para, guide, id) {
    if (para.length < guide.length)
        return null;
    var i = 0, prev = 0;
    var out = [];
    for (var gi_1 = 0; gi_1 < guide.length; gi_1++) {
        while (i < para.length && para[i] < guide[gi_1])
            i++;
        if (out.length + 1 >= guide.length)
            break;
        if (i > prev) {
            out.push(i);
        }
        prev = i;
    }
    return out;
};
var alignParagraphLinecount = function (para, paralinecount, id) {
    var out = [];
    if (para[0].match(/\^n(\d+ ?)$/) && para.length > 1)
        para[0] = para.shift() + para[0];
    if (para.length == paralinecount) {
        return para;
    }
    if (para.length > paralinecount) {
        // console.warn( `has more line ${para.length} > ${paralinecount} ,id ${id}`)
        out.push.apply(out, para);
    }
    else if (para.length < paralinecount) {
        for (var i = 0; i < para.length; i++) {
            var broken = autoENBreak(para[i]);
            // console.log(paralinecount,broken)
            out.push.apply(out, broken);
        }
    }
    out = out.filter(function (it) { return !!it; });
    while (out.length < paralinecount) {
        out.push('');
    }
    while (out.length > paralinecount) {
        var first = out.shift();
        out[0] = first + out[0];
    }
    if (out[0].match(/\^n(\d+ ?)$/) && out.length > 1) {
        out[0] = out.shift() + out[0];
        out.push('');
    }
    return out;
};

var pinNotes = function (lines, notes, opts) {
    if (opts === void 0) { opts = {}; }
    var out = [];
    var NoteIdx = {};
    var pat = opts.pat || /⚓(\d+)( ?)/g;
    var keepmarker = opts.keepmarker;
    console.log(keepmarker, 'keepmarker');
    notes.forEach(function (note) { return NoteIdx[note.id] = note; });
    var nnote = 0;
    var _loop_1 = function (i) {
        var line = lines[i], accwidth = 0;
        var nline = line.replace(pat, function (m, nid, space, off) {
            var note = NoteIdx[nid];
            if (note) {
                note.y = i;
                note.pin = off - accwidth; //update the position to be pinned (foot note marker removed)
                NoteIdx[nid] = note;
            }
            else {
                console.log('note not found', nid);
            }
            accwidth += m.length;
            nnote++;
            return keepmarker ? ('^f' + nnote + space) : '';
        });
        if (nline !== line)
            lines[i] = nline;
    };
    for (var i = 0; i < lines.length; i++) {
        _loop_1(i);
    }
    nnote = 0;
    for (var nid in notes) {
        var note = notes[nid];
        nnote++;
        if (typeof note.y == 'undefined')
            continue;
        var item = [];
        if (keepmarker) {
            item = nnote + '\t' + note.val.replace(/\n/g, '\\n');
        }
        else {
            var pin = pinPos(lines[note.y], note.pin, { wholeword: true, backward: true, offtext: true });
            item = [note.y, pin, note.val.replace(/\n/g, '\\n')]; //bb has multi line notes 
            if (!opts.removeId)
                item.push(note.id);
        }
        out.push(item);
    }
    return out;
};
var stripLinesNote = function (lines, notes, opts) {
    if (opts === void 0) { opts = {}; }
    var marker = opts.marker || '⚓';
    var regex = new RegExp(marker + '([0-9]+)', 'g');
    var notemark = opts.notemark;
    var counter = opts.counter || 0;
    lines = lines.map(function (line, y) {
        var accwidth = 0;
        var nline = line.replace(regex, function (m, m1, offset) {
            counter++;
            var note = notes[m1];
            if (note) {
                note[0] = y;
                note[1] = offset - accwidth;
            }
            else {
                /* skip note in the first line , difficult to pin */
                if (y)
                    console.log('note not found', m1, y, line);
            }
            accwidth += m.length;
            return notemark ? ('^' + notemark + counter + '<>') : '';
        });
        //^f 後面有字母才需要空白
        nline = nline.replace(/<>[ \da-zA-Z#_@~]/g, ' ').replace(/<>/g, '');
        return nline;
    });
    opts.counter = counter;
    return lines;
};

var ptk_version = 20230203;

let FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM, isTTY=true;
if (typeof process !== 'undefined') {
	({ FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM } = process.env || {});
	isTTY = process.stdout && process.stdout.isTTY;
}
const $ = {
	enabled: !NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== 'dumb' && (
		FORCE_COLOR != null && FORCE_COLOR !== '0' || isTTY
	)
};
function init(x, y) {
	let rgx = new RegExp(`\\x1b\\[${y}m`, 'g');
	let open = `\x1b[${x}m`, close = `\x1b[${y}m`;

	return function (txt) {
		if (!$.enabled || txt == null) return txt;
		return open + (!!~(''+txt).indexOf(close) ? txt.replace(rgx, close + open) : txt) + close;
	};
}
const green = init(32, 39);
const grey = init(90, 39);

var makePitakaZip = function (arr, writer) { return __awaiter(void 0, void 0, void 0, function () {
    var sizebuf, sizebuf8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                arr[7] |= 0x80; //set the flag , so that we know it is a pitaka zip
                sizebuf = new Uint32Array([arr.length]);
                sizebuf8 = new Uint8Array(sizebuf.buffer);
                arr[10] = sizebuf8[0]; //Buffer.writeInt32LE(arr.length,0xA);
                arr[11] = sizebuf8[1];
                arr[12] = sizebuf8[2];
                arr[13] = sizebuf8[3];
                if (!writer) return [3 /*break*/, 2];
                return [4 /*yield*/, writer(arr)];
            case 1:
                _a.sent();
                _a.label = 2;
            case 2: return [2 /*return*/, arr];
        }
    });
}); };
var samecontent = function (a, b) {
    if (typeof a === 'string' && typeof b === 'string') {
        return a == b;
    }
    if (a instanceof Buffer && b instanceof Buffer) {
        return Buffer.compare(a, b);
    }
    return false;
};
var writeChanged = function (fn, buf, verbose, enc) {
    if (verbose === void 0) { verbose = false; }
    if (enc === void 0) { enc = 'utf8'; }
    var oldbuf = fs.existsSync(fn) && (enc ? fs.readFileSync(fn, enc) : fs.readFileSync(fn));
    if (!samecontent(oldbuf, buf)) {
        enc ? fs.writeFileSync(fn, buf, enc) : fs.writeFileSync(fn, buf);
        if (verbose)
            console.log.apply(console, __spreadArray([green('written'), fn], humanBytes(buf.length), false));
        return true;
    }
    if (verbose)
        console.log.apply(console, __spreadArray([grey('no diff'), fn], humanBytes(buf.length), false));
    return false;
};
var writeIncObj = function (obj, outfn, verbose) {
    var arr = Array.isArray(obj) ? obj : fromObj(obj, true);
    writeChanged(outfn, arr.join('\n'), verbose);
    return arr;
};
var nodefs = new Promise(function (resolve) {
    if (typeof process !== 'undefined' && parseInt(process.version.substr(1)) > 12) {
        import('fs').then(function (fs) {
            global.fs = fs;
            import('path').then(function (p) {
                global.Path = p;
            });
            resolve();
        });
    }
    else {
        resolve(null);
    }
});
var readTextContent = function (fn) {
    var raw = fs.readFileSync(fn);
    //3 times faster than readFileSync with encoding
    //buffer is hold in C++ object instead of node.js heap
    var dv = new DataView(raw.buffer);
    var encoding = dv.getUint16(0) == 0xfffe ? 'utf-16le' : 'utf-8'; //only support utf16 le and utf8
    var decoder = new TextDecoder(encoding);
    var s = decoder.decode(raw);
    if (s.charCodeAt(0) === 0xfeff)
        s = s.slice(1); //BOM is okay, no memory write involved
    // DOS style crlf get 300% memory consumption penalty 
    if (s.indexOf('\r') > -1)
        s = s.replace(/\r?\n/g, '\n');
    return s;
};
/* read one or more files and split into array of string */
var readTextLines = function (fn, format) {
    if (format === void 0) { format = ''; }
    var files = fn;
    if (typeof fn == 'string') {
        files = [fn];
    }
    var out = [];
    for (var i = 0; i < files.length; i++) {
        var arr = readTextContent(files[i]).split('\n');
        if (format == 'tsv') {
            out = out.concat(arr.map(function (it) { return it.split('\t'); }));
        }
        else
            out = out.concat(arr);
    }
    return out;
};
var writePitaka = function (lbase_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([lbase_1], args_1, true), void 0, function (lbase, opts) {
        var name, compression, folder_1, zip_1;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    name = opts.name || lbase.name;
                    compression = opts.compress ? 'DEFLATE' : 'STORE';
                    lbase.setName(name);
                    if (!opts.jsonp) return [3 /*break*/, 1];
                    folder_1 = (opts.folder || name);
                    if (name)
                        lbase.setName(name);
                    if (!fs.existsSync(folder_1)) {
                        try {
                            fs.mkdirSync(folder_1);
                        }
                        catch (e) {
                            console.log('cannot create folder', name);
                        }
                    }
                    lbase.dumpJs(function (pagefn, buf) {
                        var outfn = folder_1 + '/' + pagefn;
                        writeChanged(outfn, buf, true);
                    });
                    return [3 /*break*/, 3];
                case 1:
                    if (!opts.JSZip) return [3 /*break*/, 3];
                    zip_1 = new opts.JSZip();
                    return [4 /*yield*/, lbase.writePages(function (pagefn, buf) { return __awaiter(void 0, void 0, void 0, function () {
                            var outfn;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        outfn = name + '/' + pagefn;
                                        return [4 /*yield*/, zip_1.file(outfn, buf, { compression: compression })];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 2:
                    _a.sent();
                    console.log('writing', name + '.ptk');
                    makePitakaZip(zip_1, function (buf) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    console.log('ptk length', buf.length);
                                    return [4 /*yield*/, fs.promises.writeFile(name + '.ptk', buf)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
};
var deepReadDir = function (dirPath) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _b = (_a = Promise).all;
                return [4 /*yield*/, fs.promises.readdir(dirPath)];
            case 1: return [4 /*yield*/, _b.apply(_a, [(_c.sent()).map(function (entity) { return __awaiter(void 0, void 0, void 0, function () {
                        var path, stat, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    path = dirPath + '/' + entity;
                                    return [4 /*yield*/, fs.promises.lstat(path)];
                                case 1:
                                    stat = _b.sent();
                                    if (!(stat.isDirectory() || stat.isSymbolicLink())) return [3 /*break*/, 3];
                                    return [4 /*yield*/, deepReadDir(path)];
                                case 2:
                                    _a = _b.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    _a = path;
                                    _b.label = 4;
                                case 4: return [2 /*return*/, _a];
                            }
                        });
                    }); })])];
            case 2: return [2 /*return*/, _c.sent()];
        }
    });
}); };
var fetchFile = function (url, fn) { return __awaiter(void 0, void 0, void 0, function () {
    var at, content, k, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                at = url.lastIndexOf('/');
                fn = fn || url.slice(at + 1);
                if (!!fs.existsSync(fn)) return [3 /*break*/, 3];
                console.log('fetching', url);
                return [4 /*yield*/, fetch(url)];
            case 1:
                k = _c.sent();
                _b = (_a = Buffer).from;
                return [4 /*yield*/, k.arrayBuffer()];
            case 2:
                content = _b.apply(_a, [_c.sent(), 'utf8']).toString();
                writeChanged(fn, content, true);
                return [3 /*break*/, 4];
            case 3:
                content = readTextContent(fn);
                _c.label = 4;
            case 4: return [2 /*return*/, content];
        }
    });
}); };

var compoundSimilarity = function (compound, parts, debug) {
    if (debug === void 0) { debug = false; }
    var score = 0, prev = -1, partlen = 0;
    debug && console.log(compound, parts);
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (debug && prev + 2 > compound.length) { //enough
            parts.length = i;
            break;
        }
        var at1 = compound.indexOf(p, prev);
        var at2 = compound.indexOf(p.slice(0, p.length - 1), prev);
        var at3 = compound.indexOf(p.slice(1), prev);
        if (debug)
            console.log(p, at1, at2, at3, prev);
        partlen += p.length;
        if (at1 > -1 && at1 >> prev && at1 <= at2) {
            score += 1;
            prev = at1 + p.length - 1;
            debug && console.log('+1', p, at1);
        }
        else if (at2 > -1 && at2 >= prev) {
            prev = at2 + p.length - 1;
            score += 1;
            debug && console.log('+1', p);
        }
        else if (at2 > -1 && at3 >= prev) {
            prev = at3 + p.length - 1;
            score += 1;
            debug && console.log('+1', p);
        }
    }
    var partlenratio = partlen / compound.length;
    if (partlenratio > 1)
        partlenratio = 1; //parts 長度總長必須足夠接近compound 長
    var sim = (score / parts.length) * partlenratio;
    debug && console.log(compound, 'sim', sim, parts, score, partlen, compound.length);
    return { sim: sim, partcount: parts.length };
};

const doParts=(parts,charpat, onPart)=>{
    let out='';
    if (typeof parts=='string') parts=[parts];
    for (let j=0;j<parts.length;j++) {
        if (!parts[j]) continue;
        if (parts[j][0]=='<' || parts[j][0]=='^') {
            out+=parts[j];
            continue;
        }

        const units=parts[j].split(charpat);

        units.forEach(s=>{
            const m=s.match(charpat);
            if (!m) {
                out+=s;
            } else {
                out+=onPart(s);
            }
        });
    }
    return out;
};

const isRomanized=str=>{
    return (!!str.match(romanized_charset));
};
const RO_CHARS="aāiīuūenoṃcvkbdtphḍṭñṅṇsjgymrlḷ";
const romanized_charset=/([aāiīuūenoṃcvkbdtphḍṭñṅṇsjgymrlḷ]+)/i;

const breakIASTSyllable=str=>{
    str=str.toLowerCase();
    const words=str.split(romanized_charset);
    return words.map(w=>{
           const syl=[];
            let prev=0;
            if (!w.trim()) {
                syl.push(w);
                return syl;
            }     
            w.replace(/([cvkbdtphḍṭṇñṅsnjgymrlḷ]*[āaiīuūeo][ṃ]?)/gi,(m,m1,offset)=>{ 
                if (offset>0 && offset>prev) syl.push(w.substr(prev,offset));
                syl.push(m1);
                prev=offset+m.length;
            });
            if (prev<w.length) syl.push( w.substr(prev));
            return syl;
        }
    )
    
};
const Vowels={
    '':'',
    //'a':'','ā':'A','i':'I','ī':'II','u':'U','ū':'UU','e':'E','o':'O'
    'a':'','ā':'A','i':'I','ī':'IA','u':'U','ū':'UA','e':'E','o':'O'
};
const beginVowels={
    //'a':'a','ā':'aA','i':'i','ī':'iI','u':'u','ū':'uU','o':'o','e':'e',
    'a':'a','ā':'aA','i':'i','ī':'iA','u':'u','ū':'uA','o':'o','e':'e',
};
const i2p={
    // '|':'|', //allow | in a word, convert from । ॥ and 
    '।':'।','॥':'॥', //as it is

    'k':'k','t':'t','ñ':'Y','ṅ':'N','ṇ':'N','ḍ':'F','ṭ':'W','p':'p','c':'c','j':'j',
    's':'s','b':'b','y':'y','g':'g','d':'d','h':'h','m':'m','l':'l','v':'v','r':'r','n':'n',
    'ḷ':'L',
    'kh':'K', 'gh':'G', 'jh':'J', 'ch':'C' ,'ṭh':'X', 'ḍh':'Q', 'th':'T', 'dh':'D', 'ph':'P', 'bh':'B',
    'kk':'kVk', 'kkh':'kVK',    'gg':'gVg', 'ggh':'gVG',
    'tt':'tVt', 'tth':'tVT',    'ṭṭ':'WVW', 'ṭṭh':'WVX',
    'pp':'pVp', 'pph':'pVP',    'bb':'bVb', 'bbh':'bVB',
    'jj':'jVj', 'jjh':'jVJ',    'cc':'cVc', 'cch':'cVC',
    'll':'lVl', 'mm':'mVm',     'nn':'nVn', 'ññ':'YVY',
    'dd':'dVd', 'ddh':'dVD',    'ḍḍ':'FVF', 'ḍḍh':'FVQ',
    'ss':'sVs', 'yy':'yVy',     'ṇṇ':'NVN', 

    'ṅgh':'NVG','ṅg':'NVg','ṅkh':'NVK','ṅk':'NVk', 'ṅkhy':'NVKVy',
    'dr':'dVr','dv':'dVv','ndr':'nVdVr',

    'br':'bVr',    'khv':'KVv',    'hm':'hVm',    'ly':'lVy',
    'mbh':'mVB','mh':'mVh','mp':'mVp','mb':'mVb',
    'nd':'nVd','ndh':'nVD','ṇṭh':'NVX',
    'ñc':'YVc','ñj':'YVj','ñjh':'YVJ',
    'ṇṭ':'NVW','nt':'nVt','ṇḍ':'NVF',
    'sv':'sVv','sm':'sVm',
    'tv':'tVv',

    //not in font ligature
    'ḷh':'LVh',
    'nth':'nVT',
    'yh':'yVh',
    'tr':'tVr',
    'mph':'mVP',
    'nh':'nVh',
    'ñch':'YVC',
    'vh':'vVh',
    'nv':'nVv',
    'ky':'kVy',
    'gy':'gVy',
    'ntv':'nVtVv',
    'my':'mVy',
    'ty':'tVy',
    'gr':'gVr',
    'kr':'kVr',
    'sn':'sVn',
    'kl':'kVl',
    'st':'sVt',
    'khy':'KVy',
    'pl':'pVl',
    'nty':'nVtVy',
    'hv':'hVv',
    'sy':'sVy',
    'dm':'dVm',
    'ṇy':'NVy',
    'kv':'kVv',
    'ṇh':'NVh',//newly added
    'ñh':'YVh',
    'vy':'vVy',
    'by':'bVy',
    'py':'pVy',
    'yv':'yVv',
    'ṭy':'WVy',
    'bhy':'BVy',
    'tthy':'tVTVy', //titthyā
    'tn':'tVn', //ratnapīṭha
    'dhv':'DVv', //Madhvāsava
    'dhy':'DVy', //sādhya
    'ny':'nVy', //Nyāsa
    'gv' :'gVv',//gvākappa
    'nky' :'nVkVy',//Mālunkyāputta
    'hy':'hVy', //corehyahāriya
    'ṇv':'NVv',//Ṇvarabhakkha
    'kkhy':'kVKVy',//alakkhyā
    'ntr':'nVtVr',//tantra 
    'bhm':'BVm',//Subhmā , only found in s0513m note of 442. Saṅkhajātakaṃ
    'dy':'dVy',//rare yadyāyaṃ only found in s0514  "ja534:43.3":
    'sp':'sVp',//rare Vanaspatīni only found in s0514 <note>वनस्पतीनि च (सी॰ पी॰), वनप्पतिञ्‍च (स्या॰ क॰)</note>
};
const p2i={};
for (let key in i2p) p2i[i2p[key]]=key;
for (let key in beginVowels) p2i[beginVowels[key]]=key;

const convertIASTSyllable=(syl,begin)=>{
    let out='';

    if (isRomanized(syl)) {
        let m=syl.match(/^([kgṅcjñṭḍṇtdnpbylḷhsmrv]*)([aāiīuūeo])(ṃ?)$/);
        if (m) {
            const [m0,c,v,niggatha] = m;
            const co = i2p[c]||'';
            if (co) {
                out+=co+Vowels[v]+(niggatha?'M':'');
            } else {
                out+=beginVowels[v]+(niggatha?'M':'');
            }
        } else {
            //return '??'+syl;
            m=syl.match(/^([kgṅcjñṭḍṇtdnpbylḷhsmrv]*)/);
            if (m) {
            	const co=i2p[m[1]];
            	if (co) out+=co+'V';
            	else out+='??'+syl;
        	} else return '??'+syl;
        }
    } else {
        return syl;
    }
    return out;
};


const fromIAST=(input,opts={})=>{
    let parts=input;
    if (opts.format==='xml') parts=input.split(/(<[^<]+>)/);
    else if (typeof parts=='string') parts=[input];
    let out='';
    for (let j=0;j<parts.length;j++) {
        if (parts[j][0]==='<') {
            out+=parts[j];
            continue;
        }
        const str=parts[j].replace(/ṁ/ig,'ṃ');
        const words=breakIASTSyllable(str);
        let s='';
        for (let i=0;i<words.length;i++) {
            for (let j=0;j<words[i].length;j++) {
                const r=convertIASTSyllable(words[i][j]);
                s+=r;
            }
        }
        out+=s;
    }
    return out;
};
const toIASTWord=p=>{
    let ch='',out='',i=0;
    ch=p[0];
    const leadv='aeiou'.indexOf(ch);
    if (leadv>-1) {
        if (p[0]=='a'&&p[1]=='A') {out+='ā';i++;}
         else if (p[0]=='i'&&p[1]=='A') {out+='ī';i++;}
         else if (p[0]=='u'&&p[1]=='A') {out+='ū';i++;}
         else if (p[0]=='i'&&p[1]=='I') {out+='ī';i++;} //not recommend
         else if (p[0]=='u'&&p[1]=='U') {out+='ū';i++;}//not recommend

        else out+=ch;
        i++;
        ch=p[i];
    } 
    let needvowel=false, noEndingA=false;
    if (p.charAt(p.length-1)=='V') { 
        noEndingA=true;
        p=p.slice(0,p.length-1);
    }
    while (i<p.length) {
        ch=p[i];
        //allow sauddesaṁ
        //if ('aeiou'.indexOf(ch)>-1) return out+'!'+p.substr(i);
        const v='MAEIOU'.indexOf(ch);
        if (v>-1) {
            if (v==0&&needvowel) out+='a'; // ṃ need 'a'
            if (p[i+1]=='A' || p[i+1]=='I' || p[i+1]=='U') { //long vowel
                i++;
                if (v==1) out+='ā'; //redundant
                else if (v==2) out+='ē'; //not exist in pali
                else if (v==3) out+='ī';
                else if (v==4) out+='ō';  //not exist in pali
                else if (v==5)out+='ū';
                else console.log('wrong vowel');
            }
            //else if (p[i+1]=='U') {i++;out+='ū'}
            else out+='ṃāeiou'[v]||'';
            i++; 
            needvowel=false;
        }  else { 
            if (needvowel) out+='a';
            let cons=p[i];
            if (cons=='V') return out+'??1'+p; //invalid
            
            while (i<p.length&& p[i+1]=='V') {
                cons+='V'+p[i+2];
                needvowel=true;
                i+=2;
            }
            const c=p2i[cons];
            if (!c ) {

                if (isNaN(parseInt(cons))) {
                    return out+'??2'+p;
                } else {
                    return out+cons; //pure number, as it is
                }
            } else {
                needvowel='aeiou।॥'.indexOf(c)==-1;
                if (c=='a' && p[i+1]=='A') {
                    i++;
                    out+='ā';
                } else {
                    out+=c;
                }
                i++;
            }

        }
    }
    if (needvowel && !noEndingA) out+='a';
    return out;
};
const toIAST=parts=>{
	if (!parts) return '';
    if (typeof parts==='string') parts=parts.split(/(<[^<]+>)/);
    return doParts(parts,/([a-zA-Z]+)/,toIASTWord).replace(/।/g,'.').replace(/॥/g,'.')
};
//from pitaka/offtext/def.js
const OFFTAG_REGEX=/(\^[a-z_]+[#@\/\.\:~a-z_\-\d]*)(\[(?:\\.|.)*?\])?/; //標記樣式
const toIASTOffText=parts=>{
    if (!parts) return '';
    if (typeof parts==='string') parts=parts.split(OFFTAG_REGEX);
    return doParts(parts,/([a-zA-Z]+)/,toIASTWord)
};

const fromIASTOffText=parts=>{
    if (!parts) return '';
    if (typeof parts==='string') parts=parts.split(OFFTAG_REGEX);
    return doParts(parts,romanized_charset,fromIAST)
};

const CharOrder=[];
const Order='aiueokKgGMcCjJYWXFQNtTdDnpPbBmhHyrRlLvsSZAIUEOV';
for (let i=0;i<Order.length;i++) {
    CharOrder[ Order.charCodeAt(i) ] = i+1;
}

const providently=(s1,s2)=>{
    let i=0,j=0;
    while (i<s1.length && j<s2.length) {
        const c1=  CharOrder[ s1.charCodeAt(i) ] || 100 ;
        const c2=  CharOrder[ s2.charCodeAt(j) ] || 100;
        if (c1!==c2) {
            return c1-c2;
        }
        i++;j++;
    }
    return 0;
};
const providently0=(s1,s2)=>providently(s1[0],s2[0]);
const providently1=(s1,s2)=>providently(s1[1],s2[1]);

const NormLexeme={
	'bODI':'bOjVJ',
	'smVbODI':'smVbOjVJ',
	// 'vVyy':'bVby',
	// 'vVyyYV':'bVbyYV', //can be removed if smarter
};
const DeNormLexeme={};
const samecount=(s1,s2)=>{
	let c=0,i1=0,i2=0;
	while (i1 < s1.length&&i2<s2.length) {
		if (s1[i1]==s2[i2]) c++;
		else break;
		i1++;i2++;
	}
	return c;
};
const sameendcount=(s1,s2)=>{
	let c=0,i1=s1.length-1,i2=s2.length-1;
	while (i1>0&&i2>0) {
		if (s1[i1]==s2[i2]) c++;
		else break;
		i1--;i2--;
	}
	return c;
};
for (let key in NormLexeme) {
	const rkey=NormLexeme[key];
	if (key.indexOf('>')>-1) continue;
	const cnt=samecount(rkey,key);
	if (cnt) {
		DeNormLexeme[rkey]=cnt?(key.slice(0,cnt)+'<'+key.slice(cnt)):key;
	} else {
		const cnt=sameendcount(rkey,key);
		DeNormLexeme[rkey]=cnt?(key.slice(0,key.length-cnt)+'>'+key.slice(key.length-cnt)):key;
	}
}

// console.log('denor',DeNormLexeme)

const InsertRules={'65':'A'};
const InsertRuleReverse={};
const Rules={ //規則號不得為 0,1,2
// A+B=C    A<B=C   A>B=C    A-B=C
//   C        AC     BC       ACB     替換結果
//
	'a<A=A':'3',
    'a<A=m':'4',
	'a<A=Vv':'5',
	'a<A=d':'6',
	'a-A=r':'7',
	'a<A=t':'9',
	'a-AA=r':'3',
	'a<I=E':'3',
	'a<I=A':'4',
	'a<I=IA':'5',
	'a-I=y':'6',
	'a-I=m':'7',

	'a<E=E':'3',
	'a<E=A':'4',
	'a-E=d':'5',
	'a-E=m':'6',
	'a-E=y':'7',
	'a<E=':'8',
	'a<g=gVg':'3', //因為不是 gVG ，所以無法 autorule
	'a<g=NVg':'4',
	'a<p=pVp':'3',

	'a<U=O':'3',
	'a<U=A':'4',
	'a<U=U':'5',
	'a<U=UA':'6',
	'a<O=U':'3',

	'a<Ū=UA':'3', //左邊的 UA 要用 Ū 表示，但sandhi 不用
	'a<Ī=IA':'4',  // IA 也是 ， 
	'a<Ī=E':'5',
	'a<t=nVt':'4', 
	'a<v=bVb':'5',

	'A<AA=':'3',  //但 AA 不轉為 Ā
	'A+U=UA':'3',
	'A+I=IA':'3',
	'A+I=E':'4',
	'A-I=y':'5',
	'A-I=r':'6',
	'A-I=t':'7',
	'A-E=y':'4',
	'A<A=y':'3',
	'A<A=m':'4',
	'A+A=E':'5',
	'A+A=A':'6',
	'A+A=':'7',
	'M>AA=m':'3',  //kImAnIsMs << kIM-aAnIsMs, remove left, keep right
	'M+A=A':'3',
	'M+A=m':'4',
	'M+A=d':'5',
	'M+A=':'6',
	'M+A=nA':'7',
	'M+E=A':'3',
	'M+b=bVb':'3',
	'M+U=UA':'3',
	'M+I=IA':'3',
	'M+I=I':'4',
	'M>I=y':'5',
	'M+I=':'6',
	'M+Ī=A':'3',
	'M+g=NVg':'3',
	'M+p=pVp':'3',
	'M+k=NVk':'3',
	'M+J=jVJ':'3',
	'M+X=WVX':'3',
	'M+y=YVY':'3',//sukhaññeva=sukhaṃ-yeva


	'I+I=IA':'3',
	'I+I=E':'4',
	'I-I=y':'5',
	'I-I=r':'6',
	'I+A=jVJ':'2', //this is a special rule for bodhi+anga
	'I+A=IA':'3',
	'I+A=A':'4',
	'I+A=Vy':'6',
    'I<A=m':'7',
	'I<A=y':'8',
	'I<A=r':'9',
	'I+A=':'10',

	'I<d=nVd':'3',
	'I+U=UA':'3',
	// 'I>aA=':'3',  //use 1 instead
	'I+AA=I':'4',
	'I-AA=r':'5',
	'I<AA=':'6', //kucchisayā=kucchi-āsayā

	'I>E=Vv':'3',
	'I>E=Vp':'4',
	'I-E=d':'5',
	'I-E=m':'7',
	'I-E=r':'8',
	'I<D=nVD':'3',
	'I>t=IA':'3', //只有接 t可能長音化
	'I>k=IA':'3', //長音化
	'Ī+A=A':'3',
	'Ī+U=UA':'3',

	'U+A=UA':'3', //長音化
	'U+A=Vv':'4',
	'U+A=A':'5',
	'U+A=VvA':'6',
	'U+A=O':'7',
	'U+A=':'8',

	'U+I=U':'3',
	'U+I=O':'4',
	'U+I=UA':'5',
	'U+U=UA':'3',
	'U-U=h':'4',
	'U>E=Vv':'3',
	'U-E=d':'4',
	'U-E=r':'5',
	'U>AA=Vv':'3',
	'U<v=bVb':'3',
	'U<D=nVD':'3',
	'U>t=UA':'3', //長音化
	'U<t=tVt':'4',
	'U<tA=tVt':'4',
	'E+A=A':'3',
	'E+A=Vy':'4',
	'E+A=VyA':'5',
	'E>AA=Vy':'5',
	'E+A=':'6',
	'E+U=UA':'3',
	'E-I=r':'3',

	'O+A=':'3',
	'O+A=Vv':'4',
	'O+A=A':'5',
	'O+A=VvA':'6',
	'O>I=Vv':'3',
	'O-I=r':'4',
	'O>E=Vv':'3',
	'O-E=y':'4',
	'O-E=v':'5',
	'O>AA=Vv':'3',
	'O-U=v':'3',//vammikovupacīyati=vammiko-upacīyati
	'V+A=':'3',
	'V+A=A':'4',
	'V+U=UA':'3',


// might be vri typo , need to fix original text
	'V+v=':'4',   //sātaccamuccati=sātaccam-vuccati
	'M+v=m':'4' , //nibbānamuccati [ 'nibbānaṃ', 'vuccati' ]

 	'a<s=r':'9',//pahūtarattaratanāya [ 'pahūta', 'satta', 'ratanāya' ]

	//reserve rules
	//01 => A insert A

	// 'y+v=bVb':'2', //this is a special rule for udaya+vaya  ==>udayabbaya

};
const PAIRING='|', EQUAL='='; //pairing left and right as a search key
const ELIDENONE=0,ELIDELEFT=1, ELIDERIGHT=2 ,ELIDEBOTH=3;
const RuleKeys={[ELIDENONE]:'-',[ELIDELEFT]:'>',[ELIDERIGHT]:'<',[ELIDEBOTH]:'+'};
const RuleKeysRegEx=/([<>\-+])/;
const JoinTypes={};
const BuildRules=()=>{
	for (let rule in Rules) {
		const joiner=Rules[rule]; // then join operator
		if (!JoinTypes[joiner]) JoinTypes[joiner]={};

		const at=rule.indexOf(EQUAL);
		const sandhi=rule.slice(at+1);
		const [left,elision,right]=rule.slice(0,at).split(RuleKeysRegEx);

		const pair=left+PAIRING+right;
		if (JoinTypes[joiner][pair]) console.log('key ',pair,'exists');
		JoinTypes[joiner][pair]=elision+sandhi; //left is not elided
	}
	for (let joiner in InsertRules) {
		InsertRuleReverse[InsertRules[joiner]]=joiner;
	}
};
BuildRules();

const isAssimiliar=(right,sandhi)=>{
	if ( sandhi.length!==3 || sandhi[1]!=='V' || right[0]!==sandhi[2]) return false;
	if (sandhi[0].match(/[ckgjbptdms]/) && (right[0]==sandhi[2] || right[0]==sandhi[2].toLowerCase()) ) return true;

	if (right[0]=='Q' || right[0]=='X' || right[0]=='F' || right[0]=='Q'|| right[0]=='Y') return true;
};
const getRule=(left,right,leftconsumed,rightconsumed,sandhi,verbose)=>{
	if ( !leftconsumed && !rightconsumed){
		if (!sandhi) return 0;//nothing to do
		const joiner=InsertRuleReverse[sandhi];
		// console.log('jointer',joiner,leftconsumed,rightconsumed,left,right)
		if (joiner) return joiner;
	}

	let rulekey=RuleKeys[ELIDENONE];
	if (rightconsumed && !leftconsumed) rulekey=RuleKeys[ELIDERIGHT];
	else if (leftconsumed && !rightconsumed) rulekey=RuleKeys[ELIDELEFT];
	else if (rightconsumed && leftconsumed) rulekey=RuleKeys[ELIDEBOTH];

	let key=left+rulekey+right+EQUAL+sandhi;

	let r=Rules[key];

	if (!r && rulekey==RuleKeys[ELIDEBOTH]) { //for ['kImAnIsMs',['kIM','aAnIsMs'],'kIM3AAnIsMs',['kI<M','m','AAnIsMs']],
		key=left+RuleKeys[ELIDELEFT]+right+EQUAL+sandhi;
		r=Rules[key];
		if (!r) {
			key=left+RuleKeys[ELIDENONE]+right+EQUAL+sandhi;
		}
	}

	if (!sandhi && !right && (!left||left==='a')) return ELIDENONE;
	if (!sandhi && right==='') return ELIDELEFT;
	if (!sandhi && (left===''||left==='a') && !right) return ELIDERIGHT;

	verbose&&console.log('RR ',right,sandhi,'assim',isAssimiliar(right,sandhi));
	//try assimilization rule

	if (!r && isAssimiliar(right,sandhi)) {
		if (isVowel(left)) r=ELIDEBOTH;
		else if (left.match(/[AIUOE]$/)) r=ELIDERIGHT;//default keeping the stem
	}
	return parseInt(r)||ELIDENONE;
};

const getLeft=str=>{
	const at=str.lastIndexOf('<');
	return ~at?str.slice(at+1):'';
};
const getRight=str=>{
	const at=str.indexOf('>');
	return ~at?str.slice(0,at):'';
};

const getTailSyl=str=>{ //return vowel
	const ch1=str.slice(str.length-1), ch2=str.slice(str.length-2);
	if (ch2==='IA') return 'Ī'
	else if (ch2==='UA') return 'Ū'
	else if (ch1==='E') return 'E'
	else if (ch1==='O') return 'O'
	else if (ch1=='A') return 'A'
	else if (ch1=='I') return 'I'
	else if (ch1=='U') return 'U'
	else if (ch1=='V') return 'V'
	else if (ch1=='M') return 'M'
	return 'a';
};

const getHeadSyl=str=>{ //return vowel or consonant
	const ch1=str.slice(0,1), ch2=str.slice(0,2);
	if (ch2==='aA') return 'aA'; //not changing, becuase a is dropped automatically
	else if (ch2==='AA') return 'AA';
	else if (ch2==='iA' || ch2=='IA') return 'Ī';
	else if (ch2==='uA' || ch2=='UA') return 'Ū';
	else if (ch1==='ū') return 'Ū';
	else if (ch1==='ī') return 'Ī';
	else if (ch1.toLowerCase()==='a') return 'A';
	else if (ch1.toLowerCase()==='u') return 'U';
	else if (ch1.toLowerCase()==='i') return 'I';
	else if (ch1.toLowerCase()==='o') return 'O';
	else if (ch1.toLowerCase()==='e') return 'E';
	else return ch1+(ch2[1]=='A'?'A':''); //because 
};

const sbProvident=str=>{ //convert long vowel to single byte, for easier comparison
	return str.replace(/UA/g,'Ū').replace(/IA/g,'Ī')
	.replace(/iA/g,'ī').replace(/uA/g,'ū')
	// .replace(/aA/g,'ā')
};

const mbProvident=str=>{//convert single byte vowel back to provident format
	return str.replace(/Ū/g,'UA').replace(/Ī/g,'IA')
	.replace(/ī/g,'iA').replace(/ū/g,'uA')
	// .replace(/ā/g,'aA')
};

const getAssimiliar=w=>{
	const m=w.match(/^([KGCJPBTDkgcjpbmtds])/);
	if (m)	return m[1].toLowerCase()+'V'+m[1][0];
	else if (w[0]=='Q') return 'FVQ';
	else if (w[0]=='F') return 'FVF';
	else if (w[0]=='W') return 'WVW';
	else if (w[0]=='X') return 'WVX';
	else if (w[0]=='Y') return 'YVY';
};
const sameAlpha=(v1,v2)=>{
	if (v1.match(/[aeiouAEIUO]/)) return v1.toUpperCase()===v2.toUpperCase();
	return v1===v2;
};
const isVowel=s=>!!s.match(/^[aeiouīūāŪĪĀAEIOU]/);
const isConsonant=s=>!isVowel(s);


const getJoinType=(jt,left,right,verbose)=>{
	let join=parseInt(jt);
	const jtypes=JoinTypes[join];
	const L=getTailSyl(left),R=getHeadSyl(right);


	if (InsertRules[jt]) {
		 return {keepRight:true,keepLeft:true,sandhi:InsertRules[jt],join:0,rightconsumed:0,leftconsumed:0};
	}

	let sandhi ,keepLeft=(join==ELIDERIGHT||join==ELIDENONE)
	,keepRight=(join==ELIDELEFT || join==ELIDENONE);
	let autorule=false;
	if (join>=ELIDEBOTH) {
		sandhi=jtypes[left+PAIRING+R];
		if (typeof sandhi==='undefined' && isConsonant(left)) { 
			sandhi=jtypes[L+PAIRING+R];
		}
	}

	if (typeof sandhi=='undefined') {
		if (jt==ELIDEBOTH || jt==ELIDERIGHT) {
			const assim=getAssimiliar(right);
			verbose&&console.log('assim',assim,right,jt);
			if (assim) {
				if (jt==ELIDERIGHT && sandhi) sandhi='<'+sandhi;
				verbose&&console.log('auto sandhi',sandhi);
				autorule=true;
				sandhi=assim;				
			}
		}
	}
	if (!sandhi)sandhi='';

	if (sandhi) {
		const elision=sandhi[0];
		if (elision==RuleKeys[ELIDENONE]) {keepLeft=true;keepRight=true;}
		else if (elision==RuleKeys[ELIDERIGHT]) keepLeft=true;
		else if (elision==RuleKeys[ELIDELEFT] ) keepRight=true;
		if (elision.match(RuleKeysRegEx)) sandhi=sandhi.slice(1);
	}
	verbose&&console.log('sandhi',sandhi,'keepLeft',keepLeft,'keepRight',keepRight);

	//autorule keep left, consume right
	let leftconsumed=(!autorule &&(!keepLeft  || join===ELIDELEFT) )?left.length:0; //vowel only , can do toLowerCase

	if (leftconsumed>1) leftconsumed=1;
	
	const rightconsumed=!keepRight&&((join===ELIDERIGHT ||join>=ELIDEBOTH)|| !sameAlpha(right,R) || autorule)?right.length:0;
	verbose&&console.log('rightconsumed',rightconsumed,'autorule',autorule);
	// verbose&&console.log('leftconsumed',leftconsumed,left.length,(join===ELIDERIGHT ||join===ELIDEBOTH||right.toUpp))

	return {keepRight,keepLeft,sandhi,join,rightconsumed,leftconsumed}
};

/*
  根據 正詞和詞件陣列，分解出 左字後綴 , 連音 ,右字前綴 。
  偶數為詞件，奇數元素為連音。  >< 刪除的部分
  輸入： pdOpm , ['pd','upm']
  輸出： [ "pd", "O" , "u>pm" ] 

  這是詞件式的展開型。
  不考慮連音是否符合規則。
*/
const tryLexeme=(lx,i,orth,prev,final,verbose)=>{
		let cap=false,alpha=false;
		if (i&&lx.slice(0,2)=='aA') {
			alpha=true; //獨字時多出的 a, parseFormula 時補上
			lx=lx.slice(1);	
		}
		verbose&&console.log(lx,orth);

		let at1=orth.indexOf(lx.slice(0,lx.length-1),prev);//開頭符合
		let at2=-1;
		if (i) {
			 at2=orth.indexOf(lx.slice(1,lx.length-1),prev); //從第2字開始符合
		}
		if (at2>-1 && orth.slice(at2)[1]=='V' && lx.length<3) { //workaround for sIAlbVbt=sIAl3bt 
		 	 const at3=orth.indexOf(lx.slice(lx.length-1),at2+1); //should not match bV
		 	 if (at3>-1 && lx.length<3) {
		 	 		at2=at3;
		 	 		at1=-1;
		 	 }
		}

    //deal with 'cEv',['c','ev']  , e=>E 
		if (i&&at1==-1 && at2>-1) { //try auto capitalize following lexeme
			if (lx.charAt(0).match(/[eiuoūīā]/) ) {
				lx=lx.charAt(0).toUpperCase()+lx.slice(1);
				cap=true; //開頭的元音轉大寫
				//try again
				at1=orth.indexOf(lx.slice(0,lx.length-1),prev);//開頭符合				
			}
		}



		verbose&&console.log('try lexeme',lx,at1,at2,orth.slice(at2),alpha);


		return [at1,at2,cap,alpha,lx]
};
const lexify=(mborth,lexemes,verbose)=>{
	let orth=sbProvident(mborth);
	let prev=0,	out=[]	,cap=false,alpha=false, lexeme='', extra='',normed=false;
	for (let i=0;i<lexemes.length;i++) {
		const final=lexemes.length-1 ==i;
		let lx=sbProvident(lexemes[i]);
		let at1,at2;
		[at1,at2,cap,alpha,lx]=tryLexeme(lx,i,orth,prev, final,verbose);
		if (at1==-1 && at2==-1) { //no match , try NormLexeme
			if (NormLexeme[lexemes[i]]) {
				lx=sbProvident(NormLexeme[lexemes[i]]);
				normed=true;
				[at1,at2,cap,alpha,lx]=tryLexeme(lx,i,orth,prev,final, verbose);
			}
		}

		let at=-1;
		if (~at1) at=at1;
		else if (~at2 && i) at=at2;

		if (at==-1) {
			out.push(-1);//fail marker
			return out;			
		}
		const plast=lx[lx.length-1];
		let samelast=false;
		verbose&&console.log(i,'o',lx,'at',at,'at1/2',at1,at2,orth.slice(at),prev,orth.slice(prev));
		const orth_at_lexemefirst=orth.slice(at-1,at);
		if (~at1) {
			let eaten=0;
			let sandhi=orth.slice(prev,at1);

			if (sandhi.charAt(sandhi.length-1)=='V') { //eat one more char for combining consonant
				 sandhi+=orth.charAt(at1);
				 eaten=1;
			}
			if (sandhi==='a') sandhi=''; //workaround for bhUaAgtO=bhU0aAgtO , double vowel
			
			i&&out.push(extra+sandhi);//sandhi
			// verbose&&extra+sandhi&&console.log('sandhi',extra,'sandhi',sandhi,prev,at1)
			let lastidx=at1+lx.length-1;
			if (lastidx>=orth.length)lastidx=orth.length-1;
			const olast = orth[lastidx];
			lexeme=lx;
			if (eaten) {
				lexeme=lx.slice(0,eaten)+'>'+lx.slice(eaten);
			}
			if (olast===plast) { //no remain
				samelast=true;
			} else {
				verbose&&console.log('plast',plast,'olast',olast, orth.slice(at1));
				lexeme=lexeme.slice(0,lexeme.length-1)+'<'+plast;
			}

		} else if (~at2 && i) {
			const samehead=orth.slice(prev,at2+1)===lx.charAt(1);
			let sandhi=orth.slice(prev,at2);
			if (!sandhi && !samehead) { 
				sandhi=orth.slice(prev,at2+1);
				verbose&&console.log('empty sandhi, eat one more',sandhi);
				at2++;
			}
			lx.charAt(0);

			if (sandhi.charAt(sandhi.length-1)=='V') {
				sandhi+=orth.charAt(at2);
				at2--;
			}
			const olast = orth[at2+lx.length-2];
			let sdhi=sandhi!==lx.charAt(1)?extra+sandhi:'';
			out.push(sdhi);
			// verbose&&console.log('last',olast,plast,at1)
			if (olast===plast) {
				samelast=true;
				lexeme=lx.charAt(0)+'>'+lx.slice(1);
				// prev+=lx.length-1 + sdhi.length;  //如果有sdhi ，表示替代，必須補回，否則at1 找不到
			} else {
				lexeme=lx.charAt(0)+'>'+lx.slice(1,lx.length-1)+'<'+plast;
			}
		}

		if (cap) lexeme=lexeme.charAt(0).toUpperCase()+lexeme.slice(1);
		if (alpha) {
			/* if orth is keeping the a , double vowel  */
			lexeme= ((orth_at_lexemefirst=='a')?'a':'A') +lexeme;
			alpha=false;
		}

		if(extra) extra='';
		if (normed&&DeNormLexeme[lexeme]!==lexeme) {
			  const dlexeme=DeNormLexeme[lexeme];
		    out.push(dlexeme||lexeme);
		    if (dlexeme) {
			    let at=dlexeme.indexOf('<');
					if (at>0) extra=lexeme.slice(at);
			    at=dlexeme.indexOf('>');
					if (at>0) { //patch the sandhi before (for udayabbaya)
						const e=lexeme.slice(0, at );
						out[out.length-2]+=e;
					}
		    }
		    normed=false;
		} else {
				out.push(lexeme);	
		}
		prev=at+lx.length-1;
		if (at!==at1&&at==at2) prev--;
		if (samelast) prev++;
		// verbose&&console.log('ORTH',prev,lx,'at',at,orth.slice(prev),'samelast',samelast,'at',at,at1,at2)

	}
	return out.map(mbProvident);
};

/*
  將詞件展開式與字串式的轉換，字串式一定可以展開，反之不然。
  字串式以數字分隔詞件，連音從數字和前後字元，按照規則產生。
*/

/** formulate lex to a string*/
const formulate=(lex,verbose)=>{
	let out='';
	if (lex.length<3) return ''
  if (lex.length%2==0) return '';
	for (let i=0;i<lex.length;i++) {
		if (i%2) {
			const sandhi=lex[i]||'';
			const leftconsumed=lex[i-1].indexOf('<')>-1;
			const rightconsumed=lex[i+1].indexOf('>')>-1;
			const leftv=getTailSyl(lex[i-1].replace('<',''));
			const rightv=getHeadSyl(lex[i+1].replace('>',''));

			let rule=getRule(leftv,rightv,leftconsumed,rightconsumed,sandhi,verbose);
			verbose&&console.log('RULE', rule,leftv,'+',rightv,'='+sandhi,verbose);
			if (rule===ELIDENONE) {
				const left=getLeft(lex[i-1]);
				const right=getRight(lex[i+1]);
				if ( (left && left!=='a') && !right) rule=ELIDELEFT;
				else if (right && !left) rule=ELIDERIGHT;
			}
			if (sandhi && rule==ELIDENONE) rule=ELIDEBOTH;
			verbose&& console.log('formulate',leftv,rightv,'sandhi',sandhi,'rule',rule);
			out+=rule;
		} else {
			let lexeme=lex[i].replace('>','').replace('<','');
			lexeme=DeNormLexeme[lexeme]||lexeme;
			out+=lexeme;
		}
	}
	return out;
};
const parseFormula=(_str,verbose)=>{
	const out=[];
	let prev=0, str=sbProvident(_str),
	consumedhead='', //被吃掉的頭
	extra='';
	if (parseInt(_str).toString()==_str) return [];
	const addLexeme=lexeme=>{
		lexeme=lexeme.replace(/^\d/,'').replace(/\d$/,'');//prevention
		if (lexeme.match(/\d/)) {
			 if (lexeme.indexOf('<')>-1 || lexeme.indexOf('>')>-1) {
			 	  console.log('error single char lexeme',_str,lexeme);
			 } else {
			 	  const p=parseFormula(lexeme.replace());
			 	  out.push(...p);
			 }
		} else out.push(lexeme);
	};

	const prevLexeme=(idx, last='',join)=>{
		const len=consumedhead.length;
		consumedhead='';
		let lexeme=len?str.slice(prev,prev+len)+'>'+str.slice(prev+len,idx):str.slice(prev,idx);
		// if (lexeme.charAt(0)==='A') lexeme='a'+lexeme;
		lexeme+=last;

		const nlexeme=NormLexeme[lexeme.replace('>','').replace('<','')];
		if (nlexeme) {
			  lexeme=lexeme.replace('<',''); //workaround for bODI bOjVJ 
				const cnt = samecount(nlexeme,lexeme);
				if (cnt&&join) { //only apply when join is not 0
					lexeme=lexeme.slice(0,cnt)+'<'+lexeme.slice(cnt);
					extra=nlexeme.slice(cnt);
				} else {
					const cnt=sameendcount(nlexeme,lexeme);
					if (cnt) {
						lexeme=lexeme.replace('>','');
						lexeme=lexeme.slice(0,lexeme.length-cnt)+'>'+lexeme.slice(lexeme.length-cnt);
						out[out.length-1]+=nlexeme.slice(0,nlexeme.length-cnt);
					}
				}
		} 
		return lexeme;
	};

	str.replace(/([a-zA-ZĪŪ])(\d+)([a-zA-ZĀĪŪāūī])/g,(m,left,jt,right, idx)=>{
		// eat one more char for leading long A, other vowel UA/IA converted one char Ū Ī
		let adv=0;
		if ( (right=='a'||right=='A') && str[idx+m.length]==='A' ) {
		   right+='A';
		   adv=1;
		}
		const {join,sandhi,rightconsumed,leftconsumed}=getJoinType(jt,left,right,verbose);
		verbose&&console.log('sandhi',sandhi,'join',join,'left',left,'right',right,'consumed l',leftconsumed,'r',rightconsumed);

		let lexeme=leftconsumed?prevLexeme(idx,(idx&&join?'<':'')+left,join): prevLexeme(idx,left,join);

		addLexeme(lexeme);

		out.push(extra+sandhi);

		extra='';
		
		consumedhead=rightconsumed?right:'';
		// verbose&&console.log('rightconsumed',rightconsumed)	
		if (join===ELIDERIGHT) idx-=left.length; //沒用到的左邊，補回長度
		else if ( !rightconsumed ||join===ELIDELEFT||join===ELIDENONE) idx-=right.length; //沒用到的右邊，補回長度
		else {
			idx-=right.length;
			verbose && console.log('right',right,'prev',idx+m.length,rightconsumed,left,sandhi);
		}
		prev=idx+m.length+adv;
		verbose&&console.log('prev',prev,str.slice(prev));
	});
	const lexeme=prevLexeme(str.length);
	addLexeme(lexeme);

	return out.map(mbProvident);
};

/** 返回 展開式的 正字*/
const orthOf=(lex,verbose)=>{
	if (typeof lex==='string') {
		lex=parseFormula(lex);
		if (lex.length<3) return '';
	}

	if (lex.length==1) return lex.join('');
	else if (lex.length==2) {
		console.log('wrong lex', lex);
		return '';
	}

	//leading a of each lexeme is elided, excerpt the first one
	// const lead_aa=lex[0].slice(0,2)==='aA';
	
	// let s=(lead_a?'a':'')+
	let s=lex.map(it=>it!==-1&&it.replace(/<.+$/,'').replace(/^.+>/,'')
		.replace(/^AA/,'A')) //AA to be combined with left consonant,   aA standalone double vowel 
		// .replace(/^([eiuo])/
		// ,(m,m1)=>m1.toUpperCase())
	.map((it,idx,self)=>( (self[idx+1]&&NormLexeme[it]) ||it))
	 //change to normLexeme only when sandhi exist 
	 // ( sambodhi has no sandhi/sambojjha has sandhi), but lexeme is always sambodhi
	.join('');
	// if (lead_aa) s='aA'+s.slice(1);

	if (s.match(/^[AEIOU]/)) s=s.charAt(0).toLowerCase()+s.slice(1);


	return s;
};
const LEXEME_SPLIT='/';
const lexemeOf=(lex,splitchar=LEXEME_SPLIT)=>{
	let s='';

	if (typeof lex==='string') {
		s=lex.replace(/\d+/g,splitchar);
	} else {
		for (let i=0;i<lex.length;i+=2) {
			if (i) s+=splitchar;
			s+=lex[i].replace(/[><]/g,'');
		}
	}

	//auto convert following lexeme first vowel to lowercase.
	s=s.replace(/(.)([AEIOU])/g,(m,m1,m2)=>m1==splitchar?m1+m2.toLowerCase():m1+m2);

	return s
};

const syllablify=w=>{
    const syl=w.split(/([kKgGbcCjJBpPtTdDFQWXhHlLmnsSvNyrY][EIOUA]{0,2}M?)/).filter(it=>!!it);
    const out=[];
    let i=0;
    while (i<syl.length) {
        if (syl[i]==='V') {
            out[out.length-1]+=syl[i]+syl[i+1];
            i++;
        } else {
            out.push(syl[i]);
        }
        i++;
    }
    return out;
};

const devanagari={
    'क':'k','ख':'K','ग':'g', 'घ':'G','ङ':'NG', 'ह':'h', // NG 會變為 provident 的 N, 不能重覆故(做反向表時val 變key)
    'च':'c','छ':'C','ज':'j','झ':'J','ञ':'Y','य':'y','श':'Z',
    'ट':'W','ठ':'X','ड':'F','ढ':'Q','ण':'N','र':'r','ष':'S',
    'त':'t','थ':'T','द':'d','ध':'D','न':'n','ल':'l','स':'s',
    'प':'p','फ':'P','ब':'b','भ':'B','म':'m','व':'v','ळ':'L','ं':'M',
    '॰':'',//abbreviation use only by pe...and inside note (版本略符)
    'अ':'a','इ':'i','उ':'u','ए':'e','ओ':'o','आ':'aA','ई':'iI','ऊ':'uU','ऐ':'ai','औ':'au',
    'ा':'A','ि':'I','ी':'II','ु':'U','ू':'UU','े':'E','ो':'O', 
    '्':'V', //virama , 連接下個輔音。
    '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9',
    // '।':'|','॥':'||',
    '।':'।','॥':'॥',
    'ौ':'aU', //invalid in pali
    'ै' :'aI',//invalid in pali
    'ऋ':'R',
    'ः':'H',//visarga, rare
};

const sinhala={
   'ක':'k','ඛ':'K','ග':'g', 'ඝ':'G','ඞ':'NG', 'හ':'h',
   'ච':'c','ඡ':'C','ජ':'j','ඣ':'J','ඤ':'Y','ය':'y','श':'Z',
   'ට':'W','ඨ':'X','ඩ':'F','ඪ':'Q','ණ':'N','ර':'r','ष':'S', 
   'ත':'t','ථ':'T','ද':'d','ධ':'D','න':'n','ල':'l','ස':'s', 
   'ප':'p','ඵ':'P','බ':'b','භ':'B','ම':'m','ව':'v','ළ':'L','ං':'M',
   'අ':'a','ඉ':'i','උ':'u','එ':'e','ඔ':'o','ආ':'aA','ඊ':'iI','ඌ':'uU',
   'ා':'A','ි':'I','ී':'II','ු':'U','ූ':'UU','ෙ':'E','ො':'O', 
   '්':'V',
};

const myanmar={
    'က':'k','ခ':'K','ဂ':'g', 'ဃ':'G','င':'NG', 'ဟ':'h',
    'စ':'c','ဆ':'C','ဇ':'j','ဈ':'J','ဉ':'Y','ယ':'y','श':'Z',
    'ဋ':'W','ဌ':'X','ဍ':'F','ဎ':'Q','ဏ':'N','ရ':'r','ष':'S',
    'တ':'t','ထ':'T','ဒ':'d','ဓ':'D','န':'n','လ':'l','သ':'s',
    'ပ':'p','ဖ':'P','ဗ':'b','ဘ':'B','မ':'m','ဝ':'v','ဠ':'L','ံ':'M',
    'အ':'a','ဣ':'i','ဥ':'u','ဧ':'e','ဩ':'o','အာ':'aA','ဤ':'iI','ဦ':'uU',
    'ာ':'A','ိ':'I','ီ':'II','ု':'U','ူ':'UU','ေ':'E','ော':'O',
    '္':'V',
    '၀':'0','၁':'1','၂':'2','၃':'3','၄':'4','၅':'5','၆':'6','၇':'7','၈':'8','၉':'9',
    ' ်':'', //ASAT
    '၊':'।','။':'॥',
};
const thai={
    'ก':'k','ข':'K','ค':'g', 'ฆ':'G','ง':'NG', 'ห':'h', 
    'จ':'c','ฉ':'C','ช':'j','ฌ':'J','ญ':'Y','ย':'y','श':'Z',
    'ฏ':'W','ฐ':'X','ฑ':'F','ฒ':'Q','ณ':'N','ร':'r','ष':'S',
    'ต':'t','ถ':'T','ท':'d','ธ':'D','น':'n','ล':'l','ส':'s',
    'ป':'p','ผ':'P','พ':'b','ภ':'B','ม':'m','ว':'v','ฬ':'L','ํ':'M', 
    'อ':'a','อิ':'i','อุ':'u','เอ':'e','โอ':'o','อา':'aA','อี':'iI','อู':'uU',
    'า':'A','ิ':'I','ี':'II','ุ':'U','ู':'UU','เ':'E','โ':'O',
    'ฺ':'V',
    '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9',
};
const khmer={
    'ក':'k','ខ':'K','គ':'g', 'ឃ':'G','ង':'NG', 'ហ':'h',
   'ច':'c','ឆ':'C','ជ':'j','ឈ':'J','ញ':'Y','យ':'y','श':'Z',
   'ដ':'W','ឋ':'X','ឌ':'F','ឍ':'Q','ណ':'N','រ':'r','ष':'S',
   'ត':'t','ថ':'T','ទ':'d','ធ':'D','ន':'n','ល':'l','ស':'s',
   'ប':'p','ផ':'P','ព':'b','ភ':'B','ម':'m','វ':'v','ឡ':'L','ំ':'M',
   'អ':'a','ឥ':'i','ឧ':'u','ឯ':'e','ឱ':'o','អា':'aA','ឦ':'iI','ឩ':'uU',
   'ា':'A','ិ':'I','ី':'II','ុ':'U','ូ':'UU','េ':'E','ោ':'O',
      '្':'V',
      '០':'0','១':'1','២':'2','៣':'3','៤':'4','៥':'5','៦':'6','៧':'7','៨':'8','៩':'9',
};
const laos={
    'ກ':'k','ຂ':'K','ຄ':'g', 'ຆ':'G','ງ':'NG', 'ຫ':'h',
    'ຈ':'c','ຉ':'C','ຊ':'j','ຌ':'J','ຎ':'Y','ຍ':'y','श':'Z',
    'ຏ':'W','ຐ':'X','ຑ':'F','ຒ':'Q','ຓ':'N','ຣ':'r','ष':'S',
    'ຕ':'t','ຖ':'T','ທ':'d','ຘ':'D','ນ':'n','ລ':'l','ສ':'s',
    'ປ':'p','ຜ':'P','ພ':'b','ຠ':'B','ມ':'m','ວ':'v','ຬ':'L','ໍ':'M',
    'ອ':'a','ອິ':'i','ອຸ':'u','ເອ':'e','ໂອ':'o','ອາ':'aA','ອີ':'iI','ອູ':'uU',
      'າ':'A','ິ':'I','ີ':'II','ຸ':'U','ູ':'UU','ເ':'E','ໂ':'O',
   '຺':'V',
     '໐':'0','໑':'1','໒':'2','໓':'3','໔':'4','໕':'5','໖':'6','໗':'7','໘':'8','໙':'9',
};
const tibetan={
    'ཀ':'k','ཁ':'K','ག':'g', 'གྷ':'G','ང':'NG', 'ཧ':'h',
    'ཙ':'c','ཚ':'C','ཛ':'j','ཛྷ':'J','ཉ':'Y','ཡ':'y','श':'Z',
    'ཊ':'W','ཋ':'X','ཌ':'F','ཌྷ':'Q','ཎ':'N','ར':'r','ष':'S',
    'ཏ':'t','ཐ':'T','ད':'d','དྷ':'D','ན':'n','ལ':'l','ས':'s',
    'པ':'p','ཕ':'P','བ':'b','བྷ':'B','མ':'m','ཝ':'v','ལ༹':'L','ཾ':'M',
    'ཨ':'a','ཨི':'i','ཨུ':'u','ཨེ':'e','ཨོ':'o','ཨཱ':'aA','ཨཱི':'iI','ཨཱུ':'uU',
    'ཱ':'A','ི':'I','ཱི':'II','ུ':'U','ཱུ':'UU','ེ':'E','ོ':'O',
    '྄':'V', 
    '༠':'0','༡':'1','༢':'2','༣':'3','༤':'4','༥':'5','༦':'6','༧':'7','༨':'8','༩':'9',
//subjoin
    'ྐ':'Vk','ྑ':'VK','ྒ':'Vg','ྒྷ':'VG','ྔ':'VN',
    'ྕྖྗ':'Vc','ྖ':'VC','ྗ':'Vj',         'ྙ':'VY',
    'ྚ':'tVt', 'ྛ':'tVT', 'ྜ':'dVd', 'ྜྷ':'dVD','ྞ':'nVN',
     'ྟ':'Vt' , 'ྠ':'VT','ྡ':'Vd','ྡྷ':'VD', 'ྣ':'Vn',
     'ྤ':'Vp','ྥ':'VP','ྦ':'Vb','ྦྷ':'VB','ྨ':'Vm',
     '།':'।','༎':'॥',
};
// export const cyrillic={
//     'к':'k','кх':'K','г':'g', 'гх':'G','н̇а':'N', 'х':'h', 
//   'ч':'c','чх':'C','дж':'j','джха':'J','н̃а':'Y','йа':'y','श':'Z',
//   'т̣а':'w','т̣ха':'x','д̣а':'f','д̣ха':'q','н̣а':'н','ра':'р','ष':'с',
// 'та':'т','тха':'т','да':'д','дха':'д','на':'н','ла':'л','са':'с',
//  'па':'п','пха':'п','ба':'б','бха':'б','ма':'м','ва':'в','л̣а':'л','м̣':'м',
//  'а':'а','и':'и','у':'у','е':'е','о':'о','а̄':'аа','ӣ':'ии','ӯ':'уу',
//  'а̄':'а','и':'и','ӣ':'ии','у':'у','ӯ':'уу','е':'е','о':'о', 
//   '':'в',  
// }

const DEVAPAT_G=/([ऀ-ॿ]+)/g;
const inverseTable=tbl=>{
    const out={};
    for (let key in tbl) out[ tbl[key] ]=key;
    return out;
};

const tables={
    hi:inverseTable(devanagari), my:inverseTable(myanmar),
    th:inverseTable(thai),       km:inverseTable(khmer),
    lo:inverseTable(laos),       si:inverseTable(sinhala),
    tb:inverseTable(tibetan) //,    cy:inverseTable(cyrillic),
};
const convertToIndic=(content,table)=>{ //pure text, no tag
    let i=0,out=[];
    if (!content) return '';
    while (i<content.length) {
        let o= table[ (content[i]+content[i+1])];
        if (o) {
            i++;
        } else o=table[content[i]];
        if (o) {
            if (content[i]==='N' && content[i+1]==='V') {
                const c=content[i+2];
                if (c==='k'||c=='K'||c=='g'||c==='G') {
                    o=table.NG;
                    if (table==tables.my) {
                        //https://viss.wordpress.com/2015/05/17/how-to-transcribe-pa%E1%B8%B7i-in-lanna-and-burmese/
                        o+=String.fromCharCode(0x103a);//ASAT 
                    }
                }
            }
            out+=o; 
        } else out+=content[i];
        i++;
    }
    return out;
};

const toIndic=(content,lang='hi')=>{
    const table=tables[lang];
    return table?convertToIndic(content,table):content;
};

const toIndicXML=(content,lang='hi')=>{
    let out='';
    const parts=content.split(/(<[^<]+>)/);
    for (let j=0;j<parts.length;j++) {
        if (parts[j][0]=='<') {
            out+=parts[j];
            continue;
        }
        const units=parts[j].split(/([a-zA-Z]+)/);
        units.forEach(s=>{
            const m=s.match(/[a-zA-Z]/);
            if (!m) {
                out+=s;
            } else {
                out+=toIndic(s,lang);    
            }
        });
    }
    return out;
};

//for importing CST
const fromDevanagariWord=w=>{ //w must me a pure devanagari word
    let out='';
    for (let i=0;i<w.length;i++) {
        let ch=devanagari[w[i]];
        if (ch=='NG') ch='N'; //ङ ण share same code
        if (typeof ch=='undefined') {
            console.log('wrong deva char',w[i],w);
        } else {
            out+=ch;                   
        }
    }
    return out;
};

var xml2indic = function (str, script) {
    if (script === void 0) { script = ''; }
    if (!script)
        return str;
    if (script === 'iast' || script === 'romn' || script === 'ro')
        return toIAST(str);
    else
        return toIndicXML(str, script);
};
var offtext2indic = function (str, script) {
    if (script === void 0) { script = ''; }
    if (!script)
        return str;
    if (script === 'iast' || script === 'romn' || script === 'ro')
        return toIAST(str);
    else
        return toIndic(str, script);
};
var deva2IAST = function (buf, onError) {
    buf = buf.replace(/\u200d/g, '');
    return buf.replace(DEVAPAT_G, function (m, deva) {
        var prov = fromDevanagariWord(deva);
        var num = parseInt(prov);
        if (!isNaN(num) && num.toString() == prov)
            return prov;
        var iast = toIASTWord(prov);
        if (onError && iast.indexOf('??') > -1) {
            onError(deva, prov);
        }
        return iast;
    });
    /*
    buf=buf.replace(/\u200d/g,''); //remove zero width joiner
    let out=doParts(buf,DEVAPAT,(deva)=>{
        const prov=fromDevanagariWord(deva);
        const num=parseInt(prov);
        if (!isNaN(num) && num.toString()==prov) return prov;
        let iast=toIASTWord(prov);
        if (onError&&iast.indexOf('??') > -1) {
            onError(deva,prov);
        }
        return iast;
    });

    return out;
    */
};
var LEXEME_REG_G = /([a-zA-Z]+[\dA-Za-z]*[a-zA-Z]+)/g;
var LEX_REG_G = /([a-zA-Z]+\d+[\dA-Za-z]+)/g;
var PALIWORD_REG_G = /([a-zA-Z]+)/g;
var isLex = function (w) { return !!w.match(/[a-zA-Z]\d[a-zA-Z]/); };
//export fromIAST,toIAST,toIASTOffText,fromDevanagari,enumTransliteration,breakSyllable,RO_CHARS;

var langSplitChar = function (palitrans) {
    return { '': '⧘', 'iast': '·', tb: '࿒' }[palitrans] || '-'; //⫶ ┆  ⧘ ⦙
};
var REG_PALI_SPACE_SPLIT = /([ ⧘\-࿒·])/;
var factorizeText = function (str, mode, palitrans) {
    if (!str)
        return str;
    var splitchar = langSplitChar(palitrans);
    return str.replace(LEX_REG_G, function (m, m1, idx) {
        if (m1.length < 4 || str[idx - 1] === '#' || str[idx - 1] === '^')
            return m1;
        var lex = parseFormula(m1);
        // if (palitrans) 
        return mode ? lexemeOf(lex, splitchar) : orthOf(lex);
        // return 
    });
};

/* assuming space as delimiter
   new offset is the begining of closest corresponding token
*/
var calOriginalOffset = function (offset, screentext, oritext) {
    if (!oritext || screentext === oritext)
        return offset;
    var acc1 = 0, acc2 = 0, i = 0;
    while (i < screentext.length && screentext[i] == ' ') { //work around for leading space
        i++;
        acc1++;
        screentext = screentext.slice(i);
    }
    i = 0;
    while (i < oritext.length && oritext[i] == ' ') { //work around for leading space
        i++;
        acc2++;
        oritext = oritext.slice(i);
    }
    var tokens1 = screentext.split(REG_PALI_SPACE_SPLIT);
    var tokens2 = oritext.split(REG_PALI_SPACE_SPLIT);
    if (tokens1.length !== tokens2.length) {
        console.warn('screen text is not converted from oritext', screentext, oritext);
        return offset;
    }
    i = 0;
    while (i < tokens1.length) {
        acc1 += tokens1[i].length;
        acc2 += tokens2[i].length;
        if (tokens1[i] && !tokens1[i].match(REG_PALI_SPACE_SPLIT) && acc1 > offset) {
            acc2 -= tokens2[i].length;
            return acc2;
        }
        i++;
    }
    return offset;
};

/* return basic word information */
// await setup();
var getFactors = function (pli) {
};
var getOrthograph = function (factored) {
};
var getWordInfo = function (pli) {
    var root, partofspeech, stem, tense, gender, number, cas, person, meaning = '', derivations, samebase;
    return {
        root: root, //詞根
        partofspeech: partofspeech, //詞品
        stem: stem, //詞幹尾 a , i 
        //活用		能, 能反
        tense: tense, //時態
        gender: gender,
        number: number,
        case: cas,
        person: person, //性,數,格|人稱
        meaning: meaning,
        derivations: derivations, //所有的延伸字 清單
        samebase: samebase,
    };
};

var Formula = /** @class */ (function () {
    function Formula(fn, json) {
        var _this = this;
        var config = Object.assign(JSON.parse(readTextContent(fn).replace(/\/\/.*\n/g, '\n')), json);
        this.lexicon = readTextLines(config.lexicon);
        var isIAST = (config.encoding === 'iast');
        this.isIAST = isIAST;
        if (config.encoding === 'iast')
            this.lexicon = this.lexicon.map(fromIAST);
        this.lexicon.sort(alphabetically);
        var decomposes = config.decomposes;
        if (typeof decomposes === 'string')
            decomposes = decomposes.split(',');
        this.decomposes = decomposes.map(function (fn) {
            var entries = readTextLines(fn);
            _this.checkdup(entries, fn);
            if (isIAST)
                entries = entries.map(fromIAST);
            entries = entries.sort(alphabetically);
            return entries;
        });
        this.patchLastDecompose();
    }
    Formula.prototype.checkdup = function (entries, fn) {
        var prev = this.getOrth(entries[0]);
        for (var i = 1; i < entries.length; i++) {
            if (this.getOrth(entries[i]) == prev) {
                console.log("warning duplicate items", entries[i], 'at line ' + (i + 1));
            }
            prev = this.getOrth(entries[i]);
        }
    };
    Formula.prototype.getOrth = function (raw) {
        if (!raw)
            return;
        var at = raw.indexOf('=');
        if (~at)
            return raw.slice(0, at);
    };
    Formula.prototype.patchLastDecompose = function () {
        // console.log('patch',this.decomposes)
        var lastdecompose = this.decomposes[this.decomposes.length - 1];
        /* overwrite first decompose with following */
        var patchcount = 0;
        for (var i = 0; i < this.decomposes.length - 1; i++) {
            var decomp = this.decomposes[i];
            for (var j = 0; j < decomp.length; j++) {
                var entry = this.getOrth(decomp[j]);
                var at = bsearch(lastdecompose, entry + '=');
                if (~at && lastdecompose[at].slice(0, entry.length) === entry) {
                    // console.log('patch',decomp[j],lastdecompose[at])
                    lastdecompose[at] = '';
                    patchcount++;
                }
            }
        }
        if (patchcount) {
            this.decomposes[this.decomposes.length - 1] = lastdecompose.filter(function (it) { return !!it; });
            console.log('patch ', patchcount, 'entries');
        }
    };
    Formula.prototype.isLemma = function (w) {
        var at = bsearch(this.lexicon, w);
        return at > -1;
    };
    Formula.prototype.findPossible = function (w, decompose) {
        var at = bsearch(decompose, w + '=');
        if (at > -1 && decompose[at].slice(0, w.length) == w && decompose[at][w.length] == '=') {
            var lex = decompose[at].slice(w.length + 1), p = 0;
            if (parseInt(lex)) {
                var breaks = lex;
                lex = '';
                for (var i = 0; i < breaks.length; i += 2) {
                    var to = parseInt(breaks.slice(i, i + 2), 10);
                    if (i)
                        lex += '0';
                    lex += w.slice(p, to);
                    p = to;
                }
                lex += '0' + w.slice(p);
            }
            return lex;
        }
    };
    Formula.prototype.expandLex = function (lex) {
        if (parseInt(lex)) {
            var breaks = lex;
            lex = '';
            for (var i = 0; i < breaks.length; i += 2) {
                var to = parseInt(breaks.slice(i, i + 2), 10);
                if (i)
                    lex += '0';
                lex += w.slice(p, to);
                p = to;
            }
            lex += '0' + w.slice(p);
        }
        return lex;
    };
    Formula.prototype.findOrth = function (w, decompose) {
        var at = bsearch(decompose, w + '=');
        if (at > -1 && decompose[at].slice(0, w.length) == w && decompose[at][w.length] == '=') {
            var lex = decompose[at].slice(w.length + 1);
            return this.expandLex(lex).split('-');
        }
    };
    Formula.prototype.factorize = function (w) {
        if (this.isLemma(w))
            return w;
        for (var i = 0; i < this.decomposes.length; i++) {
            var parts = this.findOrth(w, this.decomposes[i]);
            if (parts) {
                if (parts.length == 1)
                    return parts[0];
                var lex = lexify(w, parts);
                var lexstr = formulate(lex);
                if (orthOf(lexstr) === w) { //make sure it can recover
                    return formulate(lex);
                }
                else {
                    console.log('cannot lex ', this.isIAST ? toIAST(w) : w, this.isIAST ? parts.map(toIAST) : parts, this.isIAST ? w : '');
                }
            }
        }
        return null;
    };
    Formula.prototype.forEach = function (cb, I) {
        if (I === void 0) { I = -1; }
        if (I == -1)
            I = this.decomposes.length - 1;
        for (var i = 0; i < this.decomposes.length && i <= I; i++) {
            for (var j = 0; j < this.decomposes[i].length; j++) {
                var raw = this.decomposes[i][j];
                var at = raw.indexOf('=');
                if (~at) {
                    var orth = raw.slice(0, at);
                    var parts = raw.slice(at + 1).split('-');
                    cb(orth, parts, raw);
                }
            }
        }
    };
    Formula.prototype.guess = function (w) {
        //try stem
        var possible = [];
        var syls = syllablify(w);
        // debug&&console.log(syls)
        for (var i = 0; i < syls.length; i++) {
            for (var j = 1; j <= syls.length; j++) {
                var ww = syls.slice(i, j).join('');
                if (!ww)
                    continue;
                if (this.isLemma(ww) && possible.indexOf(ww) == -1)
                    possible.push(ww);
                for (var k = 0; k < this.decomposes.length; k++) {
                    var out = this.findOrth(ww, this.decomposes[k]);
                    if (out && possible.indexOf(ww) == -1)
                        possible.push(ww);
                }
            }
        }
        possible = possible.filter(function (it) { return it.length > 1; });
        possible = removeSubstring(possible, debug);
        debug && console.log(w, possible);
        var lex = lexify(w, possible);
        if (possible.length > 1 && !lex.filter(function (it) { return it == -1; }).length && lex.length) {
            var fullmatch = lex.join('') == w;
            if (fullmatch)
                return formulate(lex);
        }
        return possible;
    };
    return Formula;
}());

/* return a list of potential base form. */
var Stems_ = "sUtVtM,vgVg,tIA,tI,pI,M,YVc,v,Mv,yEv".split(/,/);
var Stems_verb = "nVtIyA,nVtAnM,nVtI,sI,sIA,mI,mIA,tIyA,eyVyAT,EyVyAm,eT,sVsAm,Imh,EyVyAT,EsVsnVtIA".split(/,/);
var Stems_1 = "EhI,EsU,En,sVmIm,sVmIM,sVs,AnI,Iy,ETA,tbVb,EyVY,EyVYU,mVhI,mVhA".split(/,/);
var Stems_2 = "A,O,E,I,U".split(/,/);
var knownlist = "".split(/\r?\n/).sort(alphabetically);
var enumBases = function (s) {
    var out = [];
    var p = s, verb = false;
    var at = bsearch(knownlist, s);
    if (at > -1)
        return s;
    if (s[1] == 'V' && s[0].toLowerCase() === s[2].toLowerCase()) {
        s = s.slice(2);
    }
    if (s.length < 3)
        return out;
    if (s.endsWith('V')) {
        p = s.slice(0, s.length - 1);
        out.push(p);
    }
    for (var i = 0; i < Stems_verb.length; i++) {
        if (p.endsWith(Stems_verb[i])) {
            out.push(p.slice(0, p.length - Stems_verb[i].length) + 'tI');
            verb = true;
            break;
        }
    }
    if (!verb)
        for (var i = 0; i < Stems_.length; i++) {
            if (p.endsWith(Stems_[i])) {
                p = p.slice(0, p.length - Stems_[i].length);
                if (p.endsWith('V'))
                    p = p.slice(0, p.length - 1);
                out.push(p);
                break;
            }
        }
    if (!verb)
        for (var i = 0; i < Stems_1.length; i++) {
            if (p.endsWith(Stems_1[i])) {
                out.push(p.slice(0, p.length - Stems_1[i].length));
                p = p.slice(0, p.length - Stems_1[i].length);
                break;
            }
        }
    if (!verb)
        for (var i = 0; i < Stems_2.length; i++) {
            if (p.endsWith(Stems_2[i]))
                out.push(p.slice(0, p.length - Stems_2[i].length));
        }
    if (p.endsWith('m') || p.endsWith('y'))
        out.push(p.slice(0, p.length - 1));
    if (p.endsWith('sI') || p.endsWith('mI'))
        out.push(p.slice(0, p.length - 2) + 'tI');
    return out;
};

var unescapeXMLTable = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
};
function unescapeXMLReplace(match) {
    if (match[1] === "#") {
        var num = match[2] === "x"
            ? parseInt(match.slice(3), 16)
            : parseInt(match.slice(2), 10);
        // https://www.w3.org/TR/xml/#NT-Char defines legal XML characters:
        // #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
        if (num === 0x9 ||
            num === 0xa ||
            num === 0xd ||
            (num >= 0x20 && num <= 0xd7ff) ||
            (num >= 0xe000 && num <= 0xfffd) ||
            (num >= 0x10000 && num <= 0x10ffff)) {
            return String.fromCodePoint(num);
        }
        throw new Error("Illegal XML character 0x" + num.toString(16));
    }
    if (unescapeXMLTable[match]) {
        return unescapeXMLTable[match] || match;
    }
    throw new Error("Illegal XML entity " + match);
}
function unescapeXML(s) {
    var result = "";
    var start = -1;
    var end = -1;
    var previous = 0;
    while ((start = s.indexOf("&", previous)) !== -1 &&
        (end = s.indexOf(";", start + 1)) !== -1) {
        result =
            result +
                s.slice(previous, start) +
                unescapeXMLReplace(s.slice(start, end + 1));
        previous = end + 1;
    }
    // shortcut if loop never entered:
    // return the original string without creating new objects
    if (previous === 0)
        return s;
    // push the remaining characters
    result = result + s.substring(previous);
    return result;
}

/* taken from ltx , replace event to callbacks*/
var STATE_TEXT = 0;
var STATE_IGNORE_COMMENT = 1;
var STATE_IGNORE_INSTRUCTION = 2;
var STATE_TAG_NAME = 3;
var STATE_TAG = 4;
var STATE_ATTR_NAME = 5;
var STATE_ATTR_EQ = 6;
var STATE_ATTR_QUOT = 7;
var STATE_ATTR_VALUE = 8;
var STATE_CDATA = 9;
var STATE_IGNORE_CDATA = 10;
var Sax = /** @class */ (function () {
    function Sax(opts) {
        var state = STATE_TEXT;
        var remainder;
        var parseRemainder;
        var tagName;
        var attrs;
        var endTag;
        var selfClosing;
        var attrQuote;
        var attrQuoteChar;
        var recordStart = 0;
        var attrName;
        this.startElement = opts.startElement || function (tagName, attrs) { };
        this.endElement = opts.endElement || function (tagName) { };
        this.onText = opts.onText || function (t) { };
        this._handleTagOpening = function _handleTagOpening(endTag, tagName, attrs) {
            if (!endTag) {
                this.startElement(tagName, attrs);
                if (selfClosing) {
                    this.endElement(tagName);
                }
            }
            else {
                this.endElement(tagName);
            }
        };
        this.write = function write(data) {
            if (typeof data !== "string") {
                data = data.toString();
            }
            var pos = 0;
            /* Anything from previous write()? */
            if (remainder) {
                data = remainder + data;
                pos += !parseRemainder ? remainder.length : 0;
                parseRemainder = false;
                remainder = null;
            }
            function endRecording() {
                if (typeof recordStart === "number") {
                    var recorded = data.slice(recordStart, pos);
                    recordStart = undefined;
                    return recorded;
                }
            }
            for (; pos < data.length; pos++) {
                switch (state) {
                    case STATE_TEXT: {
                        // if we're looping through text, fast-forward using indexOf to
                        // the next '<' character
                        var lt = data.indexOf("<", pos);
                        if (lt !== -1 && pos !== lt) {
                            pos = lt;
                        }
                        break;
                    }
                    case STATE_ATTR_VALUE: {
                        // if we're looping through an attribute, fast-forward using
                        // indexOf to the next end quote character
                        var quot = data.indexOf(attrQuoteChar, pos);
                        if (quot !== -1) {
                            pos = quot;
                        }
                        break;
                    }
                    case STATE_IGNORE_COMMENT: {
                        // if we're looping through a comment, fast-forward using
                        // indexOf to the first end-comment character
                        var endcomment = data.indexOf("-->", pos);
                        if (endcomment !== -1) {
                            pos = endcomment + 2; // target the '>' character
                        }
                        break;
                    }
                    case STATE_IGNORE_CDATA: {
                        // if we're looping through a CDATA, fast-forward using
                        // indexOf to the first end-CDATA character ]]>
                        var endCDATA = data.indexOf("]]>", pos);
                        if (endCDATA !== -1) {
                            pos = endCDATA + 2; // target the '>' character
                        }
                        break;
                    }
                    // No default
                }
                var c = data.charCodeAt(pos);
                switch (state) {
                    case STATE_TEXT:
                        if (c === 60 /* < */) {
                            var text = endRecording();
                            if (text) {
                                this.onText(unescapeXML(text));
                            }
                            state = STATE_TAG_NAME;
                            recordStart = pos + 1;
                            attrs = {};
                        }
                        break;
                    case STATE_CDATA:
                        if (c === 93 /* ] */) {
                            if (data.substr(pos + 1, 2) === "]>") {
                                var cData = endRecording();
                                if (cData) {
                                    this.onText(cData);
                                }
                                state = STATE_TEXT;
                            }
                            else if (data.length < pos + 2) {
                                parseRemainder = true;
                                pos = data.length;
                            }
                        }
                        break;
                    case STATE_TAG_NAME:
                        if (c === 47 /* / */ && recordStart === pos) {
                            recordStart = pos + 1;
                            endTag = true;
                        }
                        else if (c === 33 /* ! */) {
                            if (data.substr(pos + 1, 7) === "[CDATA[") {
                                recordStart = pos + 8;
                                state = STATE_CDATA;
                            }
                            else if (data.length < pos + 8 &&
                                "[CDATA[".startsWith(data.slice(pos + 1))) {
                                // We potentially have CDATA, but the chunk is ending; stop here and let the next write() decide
                                parseRemainder = true;
                                pos = data.length;
                            }
                            else {
                                recordStart = undefined;
                                state = STATE_IGNORE_COMMENT;
                            }
                        }
                        else if (c === 63 /* ? */) {
                            recordStart = undefined;
                            state = STATE_IGNORE_INSTRUCTION;
                        }
                        else if (c <= 32 || c === 47 /* / */ || c === 62 /* > */) {
                            tagName = endRecording();
                            pos--;
                            state = STATE_TAG;
                        }
                        break;
                    case STATE_IGNORE_COMMENT:
                        if (c === 62 /* > */) {
                            var prevFirst = data.charCodeAt(pos - 1);
                            var prevSecond = data.charCodeAt(pos - 2);
                            if ((prevFirst === 45 /* - */ && prevSecond === 45) /* - */ ||
                                (prevFirst === 93 /* ] */ && prevSecond === 93) /* ] */) {
                                state = STATE_TEXT;
                            }
                        }
                        break;
                    case STATE_IGNORE_INSTRUCTION:
                        if (c === 62 /* > */) {
                            var prev = data.charCodeAt(pos - 1);
                            if (prev === 63 /* ? */) {
                                state = STATE_TEXT;
                            }
                        }
                        break;
                    case STATE_TAG:
                        if (c === 62 /* > */) {
                            this._handleTagOpening(endTag, tagName, attrs);
                            tagName = undefined;
                            attrs = undefined;
                            endTag = undefined;
                            selfClosing = undefined;
                            state = STATE_TEXT;
                            recordStart = pos + 1;
                        }
                        else if (c === 47 /* / */) {
                            selfClosing = true;
                        }
                        else if (c > 32) {
                            recordStart = pos;
                            state = STATE_ATTR_NAME;
                        }
                        break;
                    case STATE_ATTR_NAME:
                        if (c <= 32 || c === 61 /* = */) {
                            attrName = endRecording();
                            pos--;
                            state = STATE_ATTR_EQ;
                        }
                        break;
                    case STATE_ATTR_EQ:
                        if (c === 61 /* = */) {
                            state = STATE_ATTR_QUOT;
                        }
                        break;
                    case STATE_ATTR_QUOT:
                        if (c === 34 /* " */ || c === 39 /* ' */) {
                            attrQuote = c;
                            attrQuoteChar = c === 34 ? '"' : "'";
                            state = STATE_ATTR_VALUE;
                            recordStart = pos + 1;
                        }
                        break;
                    case STATE_ATTR_VALUE:
                        if (c === attrQuote) {
                            var value = unescapeXML(endRecording());
                            attrs[attrName] = value;
                            attrName = undefined;
                            state = STATE_TAG;
                        }
                        break;
                }
            }
            if (typeof recordStart === "number" && recordStart <= data.length) {
                remainder = data.slice(recordStart);
                recordStart = 0;
            }
        };
    }
    return Sax;
}());

var Element = /** @class */ (function () {
    function Element(name, attrs) {
        this.name = name;
        this.parent = null;
        this.children = [];
        this.attrs = {};
        this.setAttrs(attrs);
    }
    Element.prototype.setAttrs = function (attrs) {
        if (typeof attrs === "string") {
            this.attrs.xmlns = attrs;
        }
        else if (attrs) {
            Object.assign(this.attrs, attrs);
        }
    };
    Element.prototype.c = function (name, attrs) {
        return this.cnode(new Element(name, attrs));
    };
    Element.prototype.cnode = function (child) {
        this.children.push(child);
        if (typeof child === "object") {
            child.parent = this;
        }
        return child;
    };
    Element.prototype.t = function (text) {
        this.children.push(text);
        return this;
    };
    Element.prototype.innerText = function (trim) {
        if (trim === void 0) { trim = false; }
        var out = [];
        for (var i = 0; i < this.children.length; i++) {
            if (typeof this.children[i] === 'string') {
                var t = this.children[i];
                out.push(trim ? t.trim() : t);
            }
            else {
                var t = this.children[i].innerText(trim);
                out.push(trim ? t.trim() : t);
            }
        }
        //for empty tag
        out.push(this.attrs.text || '');
        return out.join('');
    };
    return Element;
}());

var DOMFromString = function (str) {
    var tree;
    var el;
    var startElement = function (name, attrs) {
        var child = new Element(name, attrs);
        el = !el ? child : el.cnode(child);
    };
    var endElement = function (name) {
        if (name === el.name) {
            if (el.parent) {
                el = el.parent;
            }
            else if (!tree) {
                tree = el;
                el = undefined;
            }
        }
    };
    var onText = function (text) {
        if (el)
            el.t(text);
    };
    var sax = new Sax({ startElement: startElement, endElement: endElement, onText: onText });
    sax.write(str);
    return tree;
};
var walkDOM = function (el, ctx, onOpen, onClose, onText) {
    if (onOpen === void 0) { onOpen = {}; }
    if (onClose === void 0) { onClose = {}; }
    if (onText === void 0) { onText = null; }
    onText = onText || ctx.onText;
    ctx.out = ctx.out || '';
    if (typeof el === 'string') {
        ctx.out += onText ? onText(el, ctx) : el;
    }
    if (!el) {
        //console.log('empty tag')
        return;
    }
    var openhandler = onOpen[el.name] || onOpen["*"];
    if (openhandler) {
        var out2 = openhandler(el, ctx) || '';
        if (typeof out2 === 'string' && !ctx.hide)
            ctx.out += out2;
    }
    if (el.children && el.children.length) {
        for (var i = 0; i < el.children.length; i++) {
            walkDOM(el.children[i], ctx, onOpen, onClose, onText);
        }
    }
    var closehandler = onClose[el.name] || onClose["*"];
    if (closehandler) {
        var out2 = closehandler(el, ctx) || '';
        if (!ctx.hide)
            ctx.out += out2;
    }
};
function JSONify(el) {
    if (typeof el !== "object")
        return el;
    return {
        name: el.name,
        attrs: el.attrs,
        children: el.children.map(JSONify),
    };
}
var xpath = function (root, p) {
    var paths = p.split('/');
    if (!root || !root.children)
        return null;
    var found, el, children = root.children;
    for (var i = 0; i < paths.length; i++) {
        for (var j = 0; j < children.length; j++) {
            found = false;
            if (children[j].name === paths[i]) {
                el = children[j];
                if (el)
                    children = children[j].children;
                found = true;
                break;
            }
        }
        if (!found)
            return null;
    }
    return el;
};
var onOfftext = function (el, ctx, onText) {
    onText = onText || ctx.onText;
    var s = el;
    // if (teictx.trimRight) s=s.trimRight();
    if (ctx.hide || ctx.delete) {
        ctx.delete = false;
        return '';
    }
    if (ctx.compact && s.charCodeAt(0) < 0x7f) { // a compact offtag is emitted just now
        s = ' ' + s; // use blank to separate tag ]
        ctx.compact = false;
    }
    //    if (s) ctx.snippet=s;
    if (onText) {
        return onText(el, ctx, ctx.started ? s : '');
    }
    else {
        return ctx.started ? s : '';
    }
};
var walkDOMOfftext = function (el, ctx, onOpen, onClose) {
    if (onOpen === void 0) { onOpen = {}; }
    if (onClose === void 0) { onClose = {}; }
    /* helper for emiting offtext format*/
    walkDOM(el, ctx, onOpen, onClose, onOfftext);
    return ctx.out;
};

var unhide = function (ctx) { (ctx.hide ? ctx.hide-- : 0); };
var onTextWithInserts = function (el, ctx) {
    if (ctx.inserts && ctx.inserts.length) {
        el = insertText(el, ctx.inserts);
    }
    return onOfftext(el, ctx);
};
var byline = function (el, ctx) {
    var s = '\n';
    var type = el.attrs['cb:type'];
    if (type) {
        ctx.compact = true;
        s += '^h<o=' + type.toLowerCase() + '>';
    }
    return s;
};
var onClose = {
    'cb:div': function (el, ctx) { ctx.div--; },
    'cb:tt': function (el, ctx) { return unhide(ctx); },
    'cb:docNumber': function (el, ctx) { return unhide(ctx); },
    'cb:mulu': function (el, ctx) {
        if (!ctx.started)
            return;
        unhide(ctx);
        if (ctx.mulu && ctx.started) {
            ctx.mulu = false;
            return '">';
        }
    },
    byline: function (el, ctx) { return "\n"; },
    note: function (el, ctx) { return unhide(ctx); },
    // lem:(el,ctx)=>unhide(ctx),
    // l:(el,ctx)=>{ 
    //     if (ctx.snippet.substr(ctx.snippet.length-1)=='。') {
    //         ctx.compact=true;
    //         return '^r';    
    //     }
    // },
    lg: function (el, ctx) {
        return '\n';
    },
};
var corPrefix = function (fn) {
    var m = fn.match(/([A-Z]+)\d\d/);
    return m ? m[1] : '';
};
var pb = function (el, ctx) {
    ctx.lbcount = 0;
    ctx.compact = true;
    var out = '', pn = el.attrs.n.replace(/^0+/, '');
    var voltag = '';
    ctx.vol = parseInt(el.attrs['xml:id'].substr(1, 2));
    if (!ctx.volumname)
        ctx.volumname = {};
    if (el.attrs.n === '0001a') {
        ctx.compact = true;
        var ak = ctx.volumname[ctx.vol] ? '^ak' + ctx.vol + '【' + ctx.volumname[ctx.vol] + '】' : '';
        voltag = '^v' + ctx.vol + ak;
    }
    if (corPrefix(ctx.fn) === 'N') { //Nanchuan
        out = voltag + '^p' + pn.replace(/a$/, '');
        ctx.compact = true;
    }
    else if (corPrefix(ctx.fn) === 'T' || corPrefix(ctx.fn) === 'X') {
        ctx.pn = pn;
        if (voltag)
            out = voltag;
    }
    return out;
};
var p$1 = function (el, ctx) {
    if (ctx.prevpn == ctx.pn && ctx.prevlb == ctx.lbcount) {
        return '\n';
    }
    ctx.prevlb = ctx.lbcount;
    ctx.prevpn = ctx.pn;
    ctx.compact = true;
    return '\n^cb' + ctx.pn + ctx.lbcount;
};
var g = function (el, ctx) {
    if (ctx.hide)
        return '';
    var uni = ctx.charmap[el.attrs.ref.slice(1)];
    if (uni) {
        return uni;
    }
    else {
        ctx.compact = true;
        return '^mc' + el.attrs.ref.substr(3); //remove #CB
    }
};
var lb = function (el, ctx) {
    ctx.lbcount++;
    if (ctx.transclusion[ctx.fn] && el.attrs.type !== 'old') {
        ctx.ptr = ctx.transclusion[ctx.fn][el.attrs.n];
    }
    var inserts = getInserts(ctx.milestones, ctx.vol + 'p' + el.attrs.n);
    var out = '';
    if (inserts) {
        if (ctx.inserts && ctx.inserts.length) {
            console.log('unclear inserts', ctx.inserts);
        }
        ctx.inserts = null;
        inserts.forEach(function (ms) {
            if (Array.isArray(ms)) { //need to locate the text
                if (!ctx.inserts)
                    ctx.inserts = [];
                ctx.inserts.push(ms); //to be inserted when text is ready
            }
            else { //number or string
                ctx.compact = true;
                out += ms;
            }
        });
    }
    return out;
};
// const cbtt=(el,ctx)=>{
//     let s='';
//     const lang=el.children.length>1&&el.children[1].attrs&&el.children[1].attrs['xml:lang'];
//     if (el.children[0].name==='cb:t' && el.children[1].name==='cb:t') {
//         if (lang=='pi') {
//             let pi=getPali(el.children[1].innerText(true)); //take only one level
//             s='^w<'+lang+'='+pi+' '+ el.children[0].innerText(true)+'>';
//         } else {
//             s=el.children[0].innerText(true);
//         }
//     } else {
//         s=el.children[0].innerText(true);
//     }
//     ctx.hide++;
//     return s;
// }
var caesura = function (el, ctx) { return '　'; };
var onOpen = {
    p: p$1,
    pb: pb,
    g: g,
    lb: lb,
    caesura: caesura,
    byline: byline,
    milestone: function (el, ctx) { ctx.started = true; }, //skip the redundant mulu before milestone, see T30n1579_037
    note: function (el, ctx) { ctx.hide++; return ''; },
    l: function (el, ctx) { ctx.compact = true; return '\n^gatha'; },
    // lem:(el,ctx)=>{ ctx.hide+=1},//just keep the rdg
    quote: function (el, ctx) {
        if (ctx.ptr) {
            var ptr = ctx.ptr;
            ctx.ptr = '';
            return '^t@' + ptr;
        }
    },
    'cb:docNumber': function (el, ctx) { ctx.hide++; }, // 經號 privided by from catalog.json
    'cb:mulu': function (el, ctx) {
        if (!ctx.started)
            return;
        var level = parseInt(el.attrs.level);
        if (level) { // T01 0001b08 , skip cb:mulu without level 
            if (ctx.defs.mu && ctx.defs.mu.compact) {
                ctx.hide++;
                ctx.compact = true;
                return '^z' + toBase26(level - 1);
            }
            else {
                ctx.mulu = true;
                return '^z' + toBase26(level - 1) + '<t="';
            }
        }
    },
    'cb:div': function (el, ctx) {
        ctx.div++;
        // ctx.compact=true;
        return corPrefix(ctx.fn) === 'Y' ? '\n' : '\n^h<o=' + el.attrs.type + '>';
    },
    'ref': function (el, ctx) {
        if (el.attrs.target && el.attrs.type) {
            var ty = el.attrs.type;
            if (ty === 'taisho') {
                var m = el.attrs.target.match(/#vol:(\d+);page:p(\d+[abc])/);
                if (m) {
                    return '^q<loc=/cb-t/v#' + m[1] + '/p#' + m[2] + '>';
                }
            }
            // console.log(el.attrs.target)
        }
    },
    t_rdg: function (el, ctx) {
        return ''; //el.attrs.t;
    }
    // deal with app inside cb:tt <app n="0002008">  t01n0001_001
    /*
    app:(el,ctx)=>{
        ctx.hide++;
        let s='';
        if (el.children[0].name==='lem' && el.children[1].name==='rdg') {
            let lem=el.children[0].innerText(true);
            let rdg=el.children[1].innerText(true);
            s='^ap[o='+lem+(rdg?' '+rdg:'') +']';
        }
        return s;
    }
    */
};

var peelXML = function (content, ctx) {
    if (ctx === void 0) { ctx = {}; }
    var offset = 0, txt = '', prevname = '', prevoffset = 0;
    var tree = DOMFromString(content);
    var tags = [];
    var elcount = {};
    var ele = ctx.ele || {};
    var nested = ctx.nested || [];
    var onOpen = {
        '*': function (el) {
            if (!el.name)
                return;
            if (!elcount[el.name])
                elcount[el.name] = 0;
            var attrs = JSON.stringify(el.attrs);
            if (attrs == '{}')
                attrs = '';
            if (!ele[el.name])
                ele[el.name] = { count: 0 };
            ele[el.name].count++;
            if (el.parent) {
                if (!ele[el.parent.name].child)
                    ele[el.parent.name].child = {};
                if (!ele[el.parent.name].child[el.name])
                    ele[el.parent.name].child[el.name] = 0;
                ele[el.parent.name].child[el.name]++;
                if (el.parent.name == el.name) {
                    nested.push([el.count, el.name, attrs, ctx.fn]);
                }
            }
            elcount[el.name]++;
            var count = elcount[el.name] ? elcount[el.name] : '';
            tags.push(['+', count, el.name, offset - prevoffset, attrs]);
            prevname = el.name;
            prevoffset = offset;
        }
    };
    var onClose = {
        '*': function (el) {
            if (!el.name)
                return;
            if (el.name == prevname && offset == prevoffset) { //null tag
                tags[tags.length - 1][0] = '';
            }
            else {
                var count = elcount[el.name] ? elcount[el.name] : '';
                tags.push(['-', count, el.name, offset - prevoffset]);
            }
            prevoffset = offset;
        }
    };
    var onText = function (t) {
        txt += t;
        offset += t.length;
    };
    walkDOM(tree, ctx, onOpen, onClose, onText);
    return [txt, tags, tree];
};

var parseXMLAttribute = function (attrs) {
    var arr = attrs.split(/([a-z\:\_]+=".+?")/).filter(function (it) { return !!it.trim(); });
    var out = {};
    for (var i = 0; i < arr.length; i++) {
        var _a = arr[i].split(/=["＂]/), key = _a[0], value = _a[1];
        if (!value) {
            console.log('invalid attrs', arr[i], attrs);
        }
        out[key] = value.slice(0, value.length - 1); //remove tailing ""
    }
    return out;
};

var CiteFormats = [/\(CBETA[ \d\.Q]*, ([A-Z]+)(\d+), no\. ([\da-z]+), p\. ([^\)]+)\)/g]; //引用複製格式
var RefTargetFormats = [
    /vol:(\d+);page:p(\d+), ([abcd])(\d+)/, // with col and line
    /vol:(\d+);page:p(\d+)/, // page only
    /no:([\d\.]+)/, // sutra number
];
var parseVolNoPage = function (str) {
    var m = str.match(/([A-Z]{1,2})(\d\d)n(\d\d\d\d[A-Za-z]?)_?p(\d+)([a-z])(\d*)/);
    if (m) {
        return { cor: m[1], vol: parseInt(m[2]), no: m[3],
            page: parseInt(m[4]), col: m[5].charCodeAt(0) - 0x61, line: parseInt(m[6]) };
    }
};
var parseRefTarget = function (str, reftype) {
    for (var i = 0; i < RefTargetFormats.length; i++) {
        var m = str.match(RefTargetFormats[i]);
        if (m) {
            if (str.startsWith('vol')) {
                return reftype + m[1] + 'p' + m[2] + (m[3] ? m[3] + m[4] : '');
            }
            else if (str.startsWith('no')) {
                return reftype + 'n' + m[1];
            }
        }
    }
    return str;
};
var convertCitationToTEIRef = function (str) {
    for (var i = 0; i < CiteFormats.length; i++) {
        str = str.replace(CiteFormats[i], function (m0, cor, vol, no, page) {
            var target = 'vol:' + vol + ';page:p' + page;
            var text = '^j#' + parseRefTarget(target, cor.toLowerCase());
            return '<ref text="' + text + '"/>';
        });
    }
    return str;
};

//將note 可能包含的 tag 換成等效的null tag,
//以抽出notetext
var escapeQuote = function (t) {
    return t.replace(/"/g, '＂');
};
var nullify_note = function (content) {
    //夾注    
    content = content.replace(/<note([^>]*?)>([^<]+?)<\/note>/g, function (m, _attrs, t) {
        var attrs = parseXMLAttribute(_attrs);
        var place = attrs.place, type = attrs.type, n = attrs.n, resp = attrs.resp;
        var note = '';
        if (place == 'inline')
            note = '〔' + t + '〕';
        else if (place == 'foot text' && type == 'orig') {
            note = '<origfoot n="' + n + '" t="' + escapeQuote(t) + '"/>';
        }
        else if (type) {
            if (type.startsWith('cf')) {
                note = '<' + type + ' t="' + t + '" />';
            }
            else {
                note = '<' + type + '_note' +
                    (n ? ' n="' + n + '"' : '') +
                    (resp ? ' resp="' + resp + '"' : '')
                    + ' t="' + escapeQuote(t) + '"/>';
            }
        }
        else if (!attrs['xml:id']) {
            note = '<_note>' + convertCitationToTEIRef(t) + '</_note>';
        }
        else {
            note = m; //intact for <note xml:id
        }
        return note;
    });
    //<note xml:id is keep intect
    return content;
};
var nullify_rdg = function (content) {
    content = content.replace(/<rdg([^>]*?)>(.*?)<\/rdg>/g, function (m, _attrs, t) {
        t = t.replace(/<.+?>/g, '');
        var _a = parseXMLAttribute(_attrs), resp = _a.resp, wit = _a.wit;
        if (resp == 'Taisho' || typeof resp == 'undefined') {
            //有時漏了resp，視為 "Taisho", 如 T22n1428_001 : 0575b2901
            return '<t_rdg t="' + t + '" wit="' + wit + '"/>';
        }
        else {
            return '<_rdg t="' + t + '" resp="' + resp + '" wit="' + wit + '"/>';
        }
    });
    return content;
};
var nullify_lem = function (content) {
    content = content.replace(/<lem([^>]*?)>(.*?)<\/lem>/g, function (m, _attrs, t) {
        t = t.replace(/<.+?>/g, '');
        var _a = parseXMLAttribute(_attrs), resp = _a.resp, wit = _a.wit;
        if (resp == 'Taisho' || typeof resp == 'undefined') {
            //有時漏了resp，視為 "Taisho", 如 T22n1428_001 : 0575b2901
            return '<t_lem t="' + t + '" wit="' + wit + '"/>';
        }
        else {
            return '<_lem t="' + t + '" resp="' + resp + '" wit="' + wit + '"/>';
        }
    });
    return content;
};
var nullify_choice = function (content) {
    content = content.replace(/<orig([^>]*?)>([^<]*?)<\/orig>/g, function (m, _attrs, t) {
        return '<_orig t="' + t + '"/>';
    }).replace(/<sic([^>]*?)>([^<]*?)<\/sic>/g, function (m, _attrs, t) {
        return '<_sic t="' + t + '"/>';
    });
    return content;
};
var nullify_cbtt = function (content) {
    content = content.replace(/<cb:t ([^>]+)>([^<]+)<\/cb:t>/g, function (m, _attrs, t) {
        var attrs = parseXMLAttribute(_attrs);
        var lang = attrs['xml:lang'];
        if (lang === 'zh-Hant') {
            return t;
        }
        else { //remove all other language
            return '';
        }
    });
    return content;
};
var nullify_cbeta = function (content) {
    content = content.replace(/<g ref="#CB(\d+)"\/>/g, "#CB$1;"); //for note to work properly
    content = content.replace(/<figure><graphic url="([^>]+)"><\/graphic><\/figure>/g, '[fg_$1]');
    content = content.replace(/<space([^>]*?)\/>/g, function (m, attrs) {
        var attributes = parseXMLAttribute(attrs);
        return ' '.repeat(parseInt(attributes.quantity));
    });
    content = content.replace(/<unclear><\/unclear>/g, '[??]');
    content = nullify_cbtt(content);
    content = nullify_note(content);
    content = nullify_note(content); //recursive , T14n0443_004.xml 0337016
    content = nullify_rdg(content);
    content = nullify_lem(content);
    content = nullify_choice(content);
    content = nullify_note(content);
    return content;
};

var createChunkId_cbeta = function (arr) {
    var lb = {}, p = {};
    for (var i = 0; i < arr.length; i++) {
        var _a = arr[i], id = _a[0], tag = _a[1], caption = _a[2];
        var insert = tag ? (tag + (caption ? '【' + caption + '】' : '')) : caption;
        if (id.length > 11) {
            p[id] = insert;
        }
        else { //無字元位址
            var at = id.indexOf('#');
            if (~at) {
                lb[id.slice(0, at)] = [insert, id.slice(at + 1)];
            }
            else {
                lb[id] = insert;
            }
        }
    }
    return { lb: lb, p: p };
};
var insertTag_cbeta = function (txt, tags, chunkidarr) {
    var _a;
    var chunkid = createChunkId_cbeta(chunkidarr); // 之後的經只要加入陣列元素
    var vol = '', offset = 0;
    var insertcount = 0, inserttag = '', insertoffset = 0;
    var out = [];
    for (var i = 0; i < tags.length; i++) {
        // 標記序號, 字元位址 , 名稱 , 屬性
        var _b = tags[i], type = _b[0], ntag = _b[1], name_1 = _b[2], dist = _b[3], _attrs = _b[4];
        offset += dist;
        if (inserttag && offset >= insertoffset) { //此時才可以加入
            out.push(['^', insertcount++, inserttag, (dist - offset + insertoffset)]);
            out.push([type, ntag, name_1, offset - insertoffset, _attrs]);
            inserttag = '';
        }
        else {
            out.push([type, ntag, name_1, dist, _attrs]);
        }
        if (name_1 === 'TEI' && type == '+') {
            //assuming xml will never cross vol
            var attrs = JSON.parse(_attrs || '');
            vol = (_a = attrs['xml:id']) === null || _a === void 0 ? void 0 : _a.slice(0, 3);
        }
        else if (name_1 === 'p' && _attrs) {
            var attrs = JSON.parse(_attrs);
            var id = attrs['xml:id'] || '';
            var _ckid = chunkid.p[id.slice(1)];
            if (_ckid) { //此處加入新tag
                inserttag = _ckid;
                insertoffset = offset;
            }
        }
        else if (name_1 === 'lb') {
            var attrs = JSON.parse(_attrs);
            var id = attrs.n;
            if (!vol) {
                console.log(tags[i]);
                throw "no vol";
            }
            var _ckid = chunkid.lb[vol + 'p' + id];
            if (_ckid) {
                if (_ckid && Array.isArray(_ckid)) { //帶釘文
                    var pintext = _ckid[1];
                    var at = txt.indexOf(pintext, offset);
                    if (~at) {
                        inserttag = _ckid[0];
                        insertoffset = at;
                    }
                    else {
                        console.error('查無此釘文', pintext);
                    }
                }
                else if (typeof _ckid == 'string') { //文字型，在開頭
                    inserttag = _ckid;
                    insertoffset = offset;
                    var preveol = txt.charAt(offset - 1); //上一行的結尾
                    if (preveol !== '。' && preveol !== '」') { //用第一個出現的。作為起點
                        var at = txt.indexOf('。', offset);
                        if (~at && at > offset && offset + 19 > at) {
                            //  T22p0309b25 ，結尾是 。」
                            if (txt.charAt(at + 1) == '」')
                                at++;
                            insertoffset = at + 1;
                        }
                    }
                }
            }
        }
    }
    return out;
};
var offGen_cbeta = function (txt, tags, charmaps) {
    var out = [];
    var offset = 0, prevoff = 0, started = false, hide = false;
    for (var i = 0; i < tags.length; i++) {
        var _a = tags[i], type = _a[0]; _a[1]; var name_2 = _a[2], dist = _a[3]; _a[4];
        offset += dist;
        if (started) {
            var t = txt.slice(prevoff, offset);
            if (!hide)
                out.push(t);
            if (type == '^') {
                if (name_2.match(/^[a-z]/))
                    out.push('\n^ck#' + name_2 + '\n');
                else
                    out.push(name_2); //as it is
            }
        }
        if (name_2 == 'body') {
            started = true;
        }
        else if ((name_2 == 'p' || name_2 == 'l' || name_2 == 'lg') && type == '+') {
            out.push('\n');
        }
        else if (name_2 == 'cb:docNumber' || name_2 == 'note') {
            hide = (type == '+');
        }
        prevoff = offset;
    }
    return out.join('')
        .replace(/\[cf[A-Za-z\d_]+\]/g, '')
        .replace(/\[mc_([A-Za-z\d_]+)\]/g, function (m0, mc) {
        var m = charmaps[mc];
        if (!m) {
            console.log('cannot replace CBxxx', mc);
        }
        return m;
    })
        .replace(/([！。？][」])/g, "$1\n")
        .replace(/。([^』」])/g, "。\n$1")
        .replace(/([：；，])([一二三四五六七八九十])([，、])/g, "$1\n$2$3")
        .replace(/ *\n+/g, '\n').trim();
};
var StockCharMap_cbeta = {
    'CB01647': '︵𮒻至壬︶',
    'CB01808': '擪',
};
var buildCharMap_cbeta = function (tree) {
    var _a, _b;
    var out = StockCharMap_cbeta;
    var charDecl = xpath(tree, 'teiHeader/encodingDesc/charDecl');
    for (var i = 0; i < (charDecl === null || charDecl === void 0 ? void 0 : charDecl.children.length); i++) {
        var item = charDecl.children[i];
        if (item.name == 'char') {
            var id = item.attrs['xml:id'];
            for (var j = 0; j < item.children.length; j++) {
                var m = item.children[j];
                if (m.name == 'mapping' &&
                    (((_a = m.attrs) === null || _a === void 0 ? void 0 : _a.type) == "unicode" || ((_b = m.attrs) === null || _b === void 0 ? void 0 : _b.type) == 'normal_unicode')) {
                    var code = parseInt('0x' + m.children[0].slice(2), 16);
                    var c = String.fromCodePoint(code);
                    out[id] = c;
                }
            }
        }
    }
    return out;
};

var TaishoJuanPagePacked = "\u0012-\u001F%#!!\u001D ###+\" % %$&'$\n>Q\n>^\u0016\n>l\n>p&\n?.&\n?\\\u001E \n@\u001C\u0017\n@.\n@6\u0015\u0014\n@G\u0016\n@U\u0019\n@i\u001A\nA\u0011\nA\u001F\nA,\nA1\nA9\nAB\nAG\nAT\nAh\nA{\u001F !!\u001E\nBm! \u001F\u001F\u001E\u001E\u001F \u001F\nD0\" \u001F\u001E\u001E\u001E\u001F \u001F\nEg!!&'!#(&&'!%\u001F$\"&#&&  \u001F$\" \" \u001E&'\u001E\u001D+! #\"#! \u001E\"%\u001F\u001D\u001D\"%) \"\"\u001B$  #\u001D'\nP\u001B\nP\u001D\nP\u001E\nP \nP$\nP(\nP0\nP3\nP6\nP8\nP:\nP<\nP@\nPE\nPH\nPM\nPR\nPU\nPZ\u0016\nPh\nPl\nPn\nPr\nP|\nQ\u000F\nQ\u0011\nQ\u0018\nQ\u001D\nQ \nQ%\nQ&\nQ-\nQ3\nQ4\nQ:\nQ=\nQD\nQG\nQJ\nQM\nQU\nQZ\nQd\nQm\nQq\nQx\nQy\nQ|\nR\u0011\nR\u0015\nR\u001D\nR!\nR$\nR,\nR9\u0019\nRK\nRN\nRQ\nRT\nR\\\nRg\nRk\nRn\nRp\nRt\nRw\nRz\nR{\nR~\nS\u000F\nS\u0010\nS\u0019\n\u0012\"'$%'\u001E##('#&#&&'+$##%&+#\u001D*%$&\"#%')*&+$%$\"#$(&#('&\nDK$#'%*'!*'\u001C!(#'+\nG]\nGq\nGr\nGs\nGu\nGw\nGy\nGz\nG|\nG~\nH\u000E\nH\u000F\nH\u0011\nH\u0015\nH\u0016\nH\u0017\nH\u0019\nH\u001A\nH \nH&,+\"\nI\u0015\nI\u0017\nI\u001A\nI\u001E\nI#\u001E\u0018\u001E\u001C\u001D\u001E#\u001D \u001A\u001E%!\u001E\u001C#\u001C!\u001F(\u001B\"(''*\u001B!\u001B\u001D \u001F$! \u001D\u001C\u001C\u001C\u001D\"\u001E\u001E\u001C\u001B #&%\u001C\nPZ\nPe\nPh\nP~\nQ\u0015\u0015\u0017\nQ/\nQ0\nQ3\nQ7\nQ9\nQ>\nQ@\nQC\nQD\nQF\nQI\nQK\nQQ\nQU\nQ\\\nQ`\nQd\nQg\nQk\nQn\nR\u0015\n\u0012\u001E\u001F\u001F%'$\u001F\n<\u000E\"!\n<C(%'$\n=F\u001E\u001F\n=t\"!!\" $\n?\u0013%$%%\"#$! \n@j(%$'' $\nB4\u001F\u001D\u001F\"\u001E\u001D\u001C\nC=\u0018\u001A\u0017\u001A\u0019\u001B\u0016\u001B\u0019\u0015\u0016\u001A\u001A\u001B\u001B\nDo\nDu\nD}\nE\u0010\nE\u0013\u0017\u0016\u0016\u0015\u0015\nE;\nEA\nEF\nEI\nEL\nE`\nEq\nE|\u0016\u0016\u0014\nF$\nF*\nF:\nFA\nFF\nFM\nFS\nFT\nFY\nFd\nFn\u001F\nG \u001F\nG?!'&\u001F* !\nHv# #%## !#(!\nK\u000E\nK\u0018&')\nL\u000E\u001A\u001D\u001C\u001E\u001E\u001D\u001E\u001D\u001D\u001C\u001C\u001D\u001E!\u001D\u001D\u001D\u001C\u001D\u001E\u001D\u001D\u001D\u001D\u001D\u001D\u001E\u001D\u001D\u001E\u001D\u001D\u001D\u001D\u001C\u001D\u001D\u001D\u001C\u001F\u001C\u001D\u001C\u001C\u001D\u001C\u001C\u001E\u001C\u001C\u001D\u001C\u001D\u001C\u001D\u001B\u001D\u001C\u001D\nS6\u001A\u0019\u0019\u0018\u0018\u0017\u001A\u0018\u0019\u0018\u001A\u001B\n\u0012,(22\n<\u0015(+#+-'\n=Z(/\n>E\n>J(\n>z#\n?)%\n?X\n@\u000E\u001F\u001D\u001B\u001F \"\u001B! \nA? !#\u001E# \u001E\" #\u001D\u001F#\"\nCq()$$%/\u001D$%!#&\nFD#\"#\u001D\u001D\u001D\u001B\u001D\u001F\nGp\nGx\u001B\nH \"\nHD\nH_ \nI\u0011\u0019\u0018\u001B\nIA'\nIr,%+\nJg!   !  \u001E\u001F!!! \u001D\u001E\u001E \u001C\u001E\u001F!! \u001E\"\u001F !!\nO)!!\u001E\nOm\nOo\nOp\nOr\nOs\nOt\n\u0012\u001D!\u001F \u001F!\u001F  \u001F!   ! \u001F! \"!\"\u001E\u001F\"\u001F\u001F  \u001E! \u001F \u001F!!\"!\u001F\"\u001F !!!\u001F !$\u001E!  ! \u001F \u001F  \u001E \u001F\"    ! \u001E\u001F  \u001D\u001E\u001F\u001F\u001F\u001F\u001E\u001E\u001F\u001E\u001F\u001F\u001E\u001F\u001F \u001F\u001E\u001F\u001E\u001F\u001F\u001F \"\u001E\u001F\u001E\u001E\u001E\u001E\u001F\u001E\u001E \u001E\u001F\u001F\u001D\u001F\u001D\u001F\u001D\u001F\u001F\u001F\u001F\u001F\u001F\"\u001E\u001F\u001D\u001E\u001E\u001E\u001F\u001C\u001E\u001D\u001E\u001E\u001E\u001D\u001E\u001E\u001F\u001E\u001E\u001F\u001D\u001F\u001F\u001D\"\u001E\u001F\u001F\u001F\u001D\u001E\u001E\u001D\u001F\u001D \u001E\u001E\u001F\u001F\u001F\u001E\u001E \u001F\u001E\u001F\u001F\u001E\"\u001F  !  \u001E\u001E\u001D\u001E\u001E\u001F\u001E\u001D\u001D\u001E\u001E\u001D\u001F\u001F\u001F\u001E \u001F\n\u0012\"($'%&)#$\"$\"#%%((%#\n>H**!$#(!\u001F!\n@8'&#(*-+$%$+#$&##'\"\"#(#)(#)\nEs %\u001F\u001F \u001B\u001E\u001E!\nG1\u001B\u001E\u001E  \nH\u001A\u001E\"\u001F\"\nHo\u001E\u001C \u001B\u001F\u001E\u001F\u001C\u001C\nJ$\u001A\u001D\u001C\u001C\u001B\u0019\u0019\u0019\u001A\u0017\u0019\u0019\u0017\u0019\u001B\u0018\u0019\u001A\u001B\u0019\u001A\u0019\u001A\u001A\nLO\u0018\u0017\nLg\nLn#$ \u001E\u001F\u001C\nMr\u0019\nN\u0015\nN+\u001D\nNE\nNQ\nNm\nN{\nO\u0019\nO&\nO-\nO7\nO>\nOE\u001B\u001F\" #\u001F\nPH\u001D\nPc!\nQ\u0013\nQ\u0015\nQ\u0017\nQ\u001B\nQ\u001C\nQ\u001F\nQ \nQ\"\nQ#\nQ%\nQ)\nQ*\nQ.\nQ0\u0014\u0017\u0017\nQO\u001E! \u001E\u001B\u001C\u001B\u001F\"\n\u0012+)(,+)\n<..#(!\u001D('$\"\n>\"*(.+++\n?m\n?q+1\n@S (\"\nA7\u001C\u001F#\u001C \nB$\nB2\u001D\nBP\u001F \nC\u0011\u001F$\u0019\u001C\u001E!\u001C\u001C\u001D\nD2\nDM\nDZ\nDg\nDy\nE\u0019!!$&(\"$\"*&!\"\"(\"!!\"\"  \"##)$$'\u001C\u001E !%$$\u001F\u001F\u001F\" \u001D!*\"$!$\u001E!\u001D!&$$''!&!\n\u0012\u001C\u001F\u001E!\u001C#\"\u001E\u001D\u001E\u001B\u001D$!\u001F&#\u001B#\u001F\u001B!\" !\u001F #\u001B\u001D \u001A\u001A#\u001C\u001B\u001F!\"\u001B\u001A\u001E!&\u001D\u001C\u001E\"\u001C! \u001F\u001E\u001D\u001E \u001F!(&\u001E  \u001E \"\u001E$!!$\u001F\u001F\u001B'!)\"\u001D\nF>\nFB\nFP\nFZ\nFa\nFe.\u001D 1\nGk*%-\nHj\u001D\u001F\u001D\u001D\u001D\u001B\u001B\u001A\nIp\u001F\u001E\nJ2\nJ3\nJ5 #\"\nK\u000E\"$\"$#\nL \u001B \u001D\u001F\u001E\u001D\u001F\u001C\u001D\u001D\u001D\u001F\u001A\u001C\u001D\u001B \u001B\u001E\u001F\u001C\u001E\u0018\u001E\u001C\u001F\u001E\u001B\u001F\u001A\u001D\u001E\u001D\u001E!\u001E\u001A\u001E\u001C\nQ'*#\nQq\nQx\nQ|\nR\u0014\nR\u0018\u001B\u001D\u001B\u001B\nRV\nRb\nRk\nR{\u0019\nS\u001F\nS,  !$\nT\u0016\nT\u001D\nT#\nT+$')(*')&'\n\u0012\u001F#%\u001F \u001F \u001E!\"\u001F\u001D!\u001E\u001E!\u001E\u001E\u001F!%    \u001B\u001B&\u001C \"\"\"%'\u001F$' !$%\" \"\"\"\"\"\u001F\u001E\"!\"\u001C\u001D \u001C\u001F\u001D\u001E!\u001F\u001A\u001B\u001D \u001C\u001C$*\u001B\u001E\u001D\u001C\"*$$&%(\u0016\u0019!\u001E\u001B!$\u001E\u001B\u001F\u001C\u001A\u0019\u0018\u001C\u0018 *\"\u001E \u001E! \u001C\u001E\u001E.($ \u001A\u001C\u001D'&!\nLn\u001B!\nM1\u0017\u0016\u0016\u0016\u0015\u0017\u0017\u0018\u0015\u0017\u0016\u0015\u0016\u0015\u0014\u0015\u0015\u0016\u0017\nNM#\nNs\nO\u0016\nO5\u0015\u0016\u0015\u0016\u0017\u0015\u0017\u0015\u0016\u0018\u0016\u0018\u0017\u0018\u0016\u0017\u0016\u0018\u0018\u0018\u0016\u0019\u0017\u0019\u0017\u0019\u001A\u0019\u0017\u0017\u0016\u0017\u0018\u0017\u0016\u0016\u0016\u0016\u0015\nR\u001D\nR+ \nRN\u001E\"\nS\u000F\u0018\u0018\u001A\u0017\u0017\u0017\u0018\u0019\u0019\u0018\u0017\u0017\u0019\u0019\u0018\u0016\u0017\u0015\u0017\n\u0012\u001B\u001A\u0019\n;\u000F\n;'\n;?\n;R\n;b\n;d\u001F\n<\u000E\n<\u001C\n<0\n<7\u0014\u0013\n<E\n<J\n<V\n<]\n<f\n<l\n<}\n=%\n=D\u0019\n=Z!\"\n>!.\n>\\\n>`\n>c\u001F\n?\u0010\u0018\u001A\u0018\n?6\u0019\n?M\n?N\n?V\n?d\n?x\u001A\u001A\u001A\u0018\n@8\n@K\u001F\n@k\n@t\n@z\u001E\nA*\nA5\u0016\u0016\u0017\u0016\nAY#\nB\u0011\u001E!\u001E\nBO,\nC\u0014\u0017\u0018\nC.\"\nCW\nCi\nCo\nCy\nCz\nC{\nC~\nD\u001A\u0016\u0016\nD.\nD0#%\"\u001E\"!\"$# \u001F\"\u001F!  \u001F!\"#\"\u001E \"%\u001D\"#!\"\"\"\u001C\u001C\u001F\"\u001F\u001D#\nJZ\"%#\u001E#\"\u001E)'(( !&&(#\"#!\u001E#%\u001E!&\"#\"$+'$%$\nQ+'$&$)\nRG#\nRk*\nS,!\u001E\nS^ ! \u001F\nT@\u001F\u001F\nTo\u001F\u001F\nU/\u001E\nUM!\u001E\"\u001F\u001E \nV_ \nW\u0011\u001A\nW'\u001F\u001F \u001E\u001C\nX\u000F\nX\u0019\nX\u001E\nX#\nX$\nX'\nX)\nX/\nX1\n\u0012'\u001F'!\u001F#!\"&$%*+$'\"&$(\".)\"\u001C \u001E'%\"&! '! \u001F\u001D$\u001E\u001B\u001F#\"\u001C\u001D '$!5$&\u001F\u001F(/\"\"#\nEC\u001F\"!\u001C\u001D\u001E\u001E\nFS!\u001C\"\nG#\u0018\u0017\u0019\u0017\u0015\u0015\u0018\u0018\u0019\u0018\u0018\u0018\u0016\u0016\u0016\u0017\u0016\nHE#\nHo\u001D\u001F\u001E\"\u001D!\u001A\u0019\u001B\nJ\u0018\u001C\u001D\u001C\u001C\u001B\u001B\nJr\u001C\u001D\u001D\u001C\u001E\u0018\u001C\nKi\nL\u0012\nL#\nL4\u001D\nLQ\nL\\\u001E\u001C! \u001B\u001E\u001E\nMc$#\u001E  \u001F \u001D\u001F\nO+!\nOP\nOY#$''\nPW\u001B\u001B\u001D\u001B\u001C\u001C\u001C\u001A\u001D\nQd\u001D\u001D\u001D!\nR@\nRO !\nS\u0012\nS\u001F \nS@#\nSh \nT\u0017\u001E\u001D\u0019\nTK\u0019\u001C\u001A\u001D\n\u0012.')#'&(\n<6\n<J\n<M\n<P\n<R\n<U\n<Y\n<[\n<v\" \n=<\n=B\n=F\n=J\u0013\n=R\n=V!# \u001D\u001F#\"% \u001D \n?I#\u001B\u0019#\u001B\u0019\u0019\u0019\u0019\u0018\u001A\u0019\u0019\u001C\u001E\u001D!\u0019 \u001A\u001C\u0019\u0018\u0017\u0018\u0019\u0018\u0019\u0019\nBs\nC\u0014\u001D\u001B\u001F \u001B\u001A\u001C\nD\u000F\nD\u0015\u001A\nD/\nDQ\nDu\nE+\nE6\nEC\u001D\nE_\nEg\nEo\nEv\nE}\nF\u001E\nF!\nF4\nFG\nFT#\nF~\u001E\u001E\nG7\nG:\nGA\nGK\nGS\nG[)\nH\u001D\nH\u001F\nH%\nH-\nH2\nH:*\nHp$'\nI=\u001A!\u001F\"\u001E\nJ(\nJB\nJ[\u001E\nJy\u001C\nK%\u001C\u001C\u001B\nKX# \"\nL1\nL7\nLD$  \nM\u001B\nM\u001F\nM%\nM1\u0016\u0017\u0017\u0018\u0016\u0017\u0017\u0018\u0019\u0016\u0017\u0016\u0016\u0016\u0015\u0014\u0014\u0015\u0014\nNM\nNO\nNR\nN]\nNa\nNb\nNg\nNl\nNp\u0017\nO\u000F\nO\u0011\nO\u0014\nO\u0017\nO\u0019\nO\u001A\nO\u001D\nO \nO!\nO%\nO)\nO-\nO/\nO5\nO<\nOC\nOF\nOM\nOS\nOU\nOX\nOY\nO\\\nO^\nOa\nOf\nOn\nOp\nOs\nOw\nOz\nO~\nP\u0015\nP\u001A\nP'\nP*\nP2\nP7\nP:\nP<\nP>\nPH\nPM\nPT\nPV\u0016\u0017\nPl\nPv\u001B\nQ#\nQ+\nQ,\nQ/\u0017\u0017\u0017\nQO\u0016\u0014\u0015\u0015\u0016\u0016\u0017\u0016\u0016\u0018\u0019\nR8\nR:\nR=\nRN\nRZ\nR^\nRd\nRf\nRj\nRl\nRm\nRo\nRr\nRu\nS\u0017\u001C\nS2\nSL\nSP\nST\nSW\nSZ\nS[\nS^\nSb\nSg\nSi\nSk\nSn\nSp \nT!\nT(\nT,\nT.\nT1\n\u0012+'&\n;E%#'\n<+! \u001F\u001F\"\n=\"\u001E\u0018\u001C\n=P\n=b\n=e\n=u\n=w\n=}\n>\u0013\n>\u0016\n>\u0018\n>\u001A!##\n>g\n>h\n>m\n>x\u001F\n?&\u0018\n?<\n?>\n??&#*#%\u001E\n@a\n@s\n@v\n@z\n@~\nA\u0012\nA\u0014*+\nAe&\nB%\nB&\"\nBH\nBQ8\nC+\nCA\u001D\nC_\nCa\nCi\nCo# \nD7\u001E! \nDx'\nE;$&\nE}\u0019\u001B\u001A\u0019\u0018\nFJ\nFQ\nFf\nFm\nG\u0013\nG&\u0016\u0017\u0016\u001A\nGO \u001D\u001D\nH\u0017 \nH8#\nH_+\nI#\u001D(\"\u001C/&)!!\nK\u0016\nK \nK2'\nKc\u001E \" !\u001C\u001D\u001B \nM\u001B\nM\"\nM6\nME\u001C\u001B\nMi\nMv\u001B\u001D \nNI\"\nNk\u001B\u0018\nO \u0017\u0018\nO:$%\nO~\nP\u0011\n\u0012'51&(7.%%&&!'\n=}$!(*)-0\u001D1\n@ !##\u0018\u0019\u0016\nA\u000F!$\u001E##\u001B\nB\u001D\u001E\u001C\u001D\u001C\u001D\u001C\u001D\u001C\u001D\nC4\nC:\nCG  !\nD\u001F!% \u001A\u001B\u001F\u001F\nE1\u001F\u001F\u001B\u001D\u001E\u001F\u001E\"#\nFb\nFl\nF}\nG\u0012 \nG3-)&\nH-$ #\"#\"!!/\nJ$%!$%&)\nKT \nKy\"\nL,\u001D\u001D\u001D\u001D\nLr\u001D\u001D \u001E\nMF\nMP\nMZ\nMa\nMj%'\nNA(/\nO)\nO.\nO/\nO2\nO3\nO5\nO8\nO=\nOB\nOJ\nOL\nOP\u0019\nOd\nOg\nOj\nOm\nOp\nOr\nOv\nOy\nP\u0016\nP\u001F\nP#\nP%\nP&\nP+\nP/\nP6\nP=\nPC\nPL\nPO\nPT\nPX\u0019\nPm\u0018\nQ\u0010\nQ\u0013\u0017\nQ\"\u0018\u0016\n\u0012 \u001F   !\"\" !\" %# #  \u001E\u001F \u001D#!!\u001E! \"#!\"\"!\"!\"!\"%\" !!\u001F\"\u001F! \u001F  ! ! \"$ \"\"&!\u001F \u001F  \u001F\nEa\u0018\u0017\u001A\u0015\u001B\u001B\u001A\nFB\nFO\nFU\nF\\\nFd\nFe !! \u001E\"\u001F!#\nH3\nHH\nHV\nH[\nHi\nHk\nHn\nHs\nHw\nH|\nI\u0010\nI\u0011\nI\u0013\nI\"\nI&\nI,\nI<\nIE\nIK\nIR\nIU\nIi\nIk\nIo\nIq\nIr\"\nJ)\nJ.\nJ2\u0017\u0018\nJL\nJN\nJZ\nJh! $&%\nKq\nK|\u0017\u0015\nL\u001E\nL$ \u001E \u001E\u001F\u001E\nM\"\nM&\nM(\nM4\nM7\nM;\nM=\nM>\nM?\nMG\nMI\nMN\nMO\nMR\nMS\nM\\\nM_\nMa\nMf\nMl\nMr\nMs\nMu\nMw\nM{\nN \nN!\nN\"\nN&\nN*\nN,\nN3\nN8\nN9\nN:\nN;\nN@\nNF\nNG\nNJ\nNL\nNM\nNU\nNV\nN\\#\nO\u0014\nO\u001D\nO#\nO7\nOH\u001E\u0018\nOm\u001E\u001A\u001D\nP0\nPH\u001B\nPb\nPc\nPm\u001C\nQ\u0016\nQ(\nQ=\nQU\nQY\nQ_\nQ`\nQe\nQj\nQp\nQw\nQz\nR\u0016\nR$\nR*\nR.\nR=\u0016\nRL\u001E\nRg\nRk\nRn\nS\u0019\u0018\u0018\nS3\nS7\nS<\nS?,)\n\u0012('#\")!\n<\u0016\n<4\u001A9\n=\u000F(&\n=F);\u0017\n>>%&\n>}\u001B\n?#\n?*\n?.\n?2\n?3\n?=\n?R\n?V\n?a\n?i\n@\u001A\u001F\u001E\n@K''&\nA5!\nAf\u0019 \nB!\nB*\nB6\nBH\nBM\nBm$\nC!\nC.\nC<\nCI\nCM\nCQ\nCS\nCY\u0017\u0017\u0018\u0018\u001B\u001C\u001D\u001C\u0019\u001A\u0019\u001A\u0019\u0017\u0018\u0017\u001A\u0018\u0019\u001A\u001A\u001A\u001D\u0019\u0016\u0018\u001B\u001B\u001C\nFA\u001B\u001A\u001D\nFu\u0014\u0015\nG\u0017  &!\u001E\u001F\nH#\nH,\u001A\u001B\u0019\u001B\u001B\nHo\u0016\nH~\u001C\u001B\u0017\u0016\nIB\u001D\u001D \u001B\nJ\u0018\nJ&\u001A\u0018\u0016\u0017\nJT+6;\u001A0;\u0018(\nL~\u001E\u001B2\nM]!\u001E/\nN>\u001A\u001C\u0019\nNi\u0019\u001E\nO\u001D\nO(\nO7\nOA-,&7'%/*)''\nRA\nRC\nRG\nRc\nRl\nRs\nRw\nS\u0013\nS \nS$\nS-\nS>\nSC\nSO\nSS\nSU\n\u0012\n\u0014\n\u0016\"\n;\u0010\n;\u001F\n;&\n;:\n;E\u001D\n;_\n;s\n<-\n<8\n<;\n<K\n<R\n<_\n<a\n<b\n<g\n<p\n<u\n<y\u0019\n=\u001F\n=#\n=%\n='\n=,\n=<\u001D\u001D\u001E\u001D\u001B\u001D(\u001D\u001F\n>a\u001F\u001E#\n?:\n?U\n?Y\n?a\u001F%!)\n@M*#\"/\nAR  !\nB$*#\nBf\nBw\nB~\nC\u001B\nC/\nC1\nC8\nC9\nCG\nCN\nCQ\nCS\nC]\nCq\nC}\nD\u0012\nD\u0019\nD&\nD.\nD:+\nDh\nE$\nE+\nE4\nE>\nEF\nEG\nEI\nEU&/\nF.\nFB \nFh\u001F%\nG/\nG3\nG;\nGD\u001B\nG\\\nG^\u001A\nGt\nH\u0015\nH*\nH;\nHC\nHL\u001E\u001D\u001C\u001B\"\u001D\u001E\"\"\nIw\nI{\u0019\"\nJ9\nJR\nJ^\nJ`\u001C\nK\u000E\nK\u0013\"\u001D\nKG\u001F\u001B\nL\u0016\nL6\nLL\nLX\nLZ\nL`\nLh\nLq\nL}\nM\u0015\nM\u001F\nM,\nM;\nM@\nMA\nMB\nMQ\nMY\nMe\u0015\nMr\nMx\nN/\nN7\n\u0012\n\u001D\n#\n*\n;\u0015\n;\u0016\n;\u0019\n;\u001D\n;\"\n;(\n;>\n;B\n;E\n;I\n;T\n;Y\n;e\n;f\n;h\n;m\n;o\u001C\u001C\u001B\n<1\n<:\n<=\n<A\n<E\n<I\u001F\n<k\u001C\"\n=!\n=7\n==\n=P\n=U\n=X\n=Z\n=g\n=|\n>\u0013\n>-\n>2\u0017\u001A\n>N\n>W\n>`'\n?\u001D\n?!\n?%\n?6\n?I\n?M\n?O\n?S\n?k\n?n\n?w\n?}\n@\u0010\n@\u0019\n@'\n@4\n@9\n@A\n@N\n@V$ \u001F\u001E\u001D\u001E \u001C \u001C !\u001D\u001F#\u001D\"!%$ \"$\" \u001C\u001D$#\nE%\nE/\nE:\nED\nEh\u0017\u0019\nF\u0018\u001D\nF9\nFD\nFM\nFY\nFc\nG\u0019\nG\u001F\nG%\nG+\nG1\nGB\nGD\nGQ\nGU\nGk\nGu\nGy\nG{\nH\u0013\nH\u0016\nH\u001C\nH*\nHA\nHH\nHU\nH^\nHk\nHv\nH~\nI\u0010\u0017\nI\"\u001C \nIO\nIa\nId\nIq\nIt\nIz\nI}\nJ\u000F\nJ\u0014\nJ\u001C\nJ&\nJ-\u001E\nJL\nJL\nJM\nJP\nJT\nJY\nJ`\nJ`\nJg\nJk\nJu\nJ{\"\nKJ\nK_\nKn\nKt\nKv\nKx\nL\u001E\nL\u001F\nL1\nL4\nL:\nLB\nLI\nLJ\nLM\nLQ\u0019\u001B\u0019\nL|\u0019\u001A\nM3\nM?\nMB\nML\nMV\nMj\nMm#\u001A\u001B$\"\u001E \u001C \nO,\nO-\nO0\nO2\nO5\nO8\nO?\nOT\nP\u0013\nP\u0015\u0019\nP)\u0017\nP9\nPK\nPf\u001E\u001F\u0019\u001C\u001A\u0019\u0019\u0018\u0018\u001A\u001A\u001B\u0018\u001A\u0018\u001A\u0018\u0018\u0015\nRV \u001E(\u001A\nS0\nS<\nSD\nSH\nSJ\nSN\n\u0012\n$\n6\u0019\u001B\n;'\n;4\n;?\n;E\n;S\n;T\n;V\n;X\n;]\n;`\n;v\n<J\n<L\n<U\n<Y\n<d\u001B\u001B\n=\u0019\n=$\n=&\n=+\n=2\"\")\u001B\n>\u0015\n>\u001F\n>&\n>7\n>:\u001C\u001D\n>i\n>m\n>s\n?\u0011\n?\u001A\n? \n?&\n?.\n?0\n?4\n?8\n?P\"\u001F\n?}\n?~\n@\u000F\n@\u001C\u001A\n@2\n@8\n@?\n@O\n@Q\n@X\n@_\n@h*\"\nA1\nA4\nA;\nAF\nAL\nAN\u001B\u001A\u0018\u0019\u0018\u0018\nB\"\nB$\nB%\nB/\nB3\nB6\nB8\nB=\nBC\nBG\nBJ\nBX\nBY\nB`\nBb\u001B\u001B\u001A\nC\u001E\nC$\nC&\nC+\nC6\nC;\nCU\nCW\nC]\nC^\nC`\u0017\nCq\u0018\nD\u000E\nD\u0010\nD\u0013\nD\u001B\u0019\u0017\nD7\nDK\nDR\nDT\nDW\nDY\nD]\nDe\nDh\nDm\nDr#\nE' \nEG\nEd\nEg\nEk\nEo\nEq\nEt\nEw;\u0012\nFT\nFc\nFi\nFt\nFx\nF|\nG\u000E\nG\u0013\nG\u0014\nG\u0014\nG\u001F\nG#\nGC\nGO\nGS\nGT\nGU\nGW\nGX\nGX\nGX\nGY\nGc\u001C\u0016\u0018\u001B\u0019\u0018\u0017\u0019\u0017\u001E\u001A\nHn%!\u001E\nIH\nIS\nI\\\u0017\u001A\u0019\nJ\u0011\u001D $&\u001D!# \u001C\nKK\nKR\nKU \u001F\u001B\nL \u001C\u001D\u001D\u001E\u001C\u001D\u001D\u001C\u001C\u001E\u001D\u001C\u001E\u001F\u001F\u001B\u001D\u001C\u001E\nNX\u001F\u001A\u001D\u001F\u001F \u001D\u001D\u001A\u001A\u001B\u0018\u0019\u0019\u001A\u001E\u001D\u001D\u0017\nPr\nQ\u000F\nQ\"\nQ/\nQ<\nQ@\nQB\nQI\nQL\nQN\nQP\nQR\nQY\nQe\nQl\nQn\nQp\nQs\nQv\nQw\nR\u0010\nR\u0013\nR\u0015\nR\u0016\nR\u0018\nR\u0019\nR\u001B\nR\u001C\nR\u001E\nR$\nR'\nR(\nR*\nR7\nR:\u0014\nRC\nRL\nRN\nRO\nRR\nRS\nRT\nRU\nRW\nRX\nRY\nR[\nR]\nR]\nR_\nR`\nRf\nRh\nRl\nRn\nRp\nRs\nRv\nRw\nR{\nR~\nS\u0011\nS\u0014\nS\u0017\nS\u0018\nS\u0019\nS\u001A\nS\u001F\nS#\nS%\nS&\nS'\nS*\nS,\nS4\nS6\nS:\nSB\nT\u000E \n\u0012!%(&$(()*  ! \"$!%&\u001D$#\"\u001E\u001F\u001F&\u001A\u001D\u001E\n?f\n@\u0018\n@/\n@V'%1(*--+.&\"!##%'(*)+(+%%'()(%+(&!&%%#&#\nI#\nI8\nIY) ##$\"$#\u001E%&'&!&#&%$&#%$%%$&$#&&'(+**%&#%%'.*-,\"'(&%%% $&&&#\nUM\nUe\nU|\nV*\nVI\nVs\n\u0012\"\"&(4 \"+'\" #%# '$\"()-$(\u001D\"- #%$%(\u001F*!%%&(&%$##$-!,#((&.\"#))0%&\nG\u0019\nG3\nGQ\nGf\nG}#$$$%###\nIR##\"##%\"!\u001D\nK+\u001F!\u001B\u001E\u001F \u001F\u001E\"\u001F\u001F \u001F\u001F\u001E\u001F\u001F!!\" ##\u001F !\u001E!\u001F   \u001F\u001F\u001E\"!\u001F#\u001F \u001C!\u001E!!\u001F\u001D\"\nR\\\u001D\"\u001F  !   \"\u001B!\"\u001F!\u001F  \"\nU] \u001E\u001C\nV*\nV5\nVA\u001E\n\u0012\u001C\u001D\u001E\u001C\u001C\u001D\u001D\u001D\u001E\u001D\u001D\u001E\u001F#$#'\n=$\n=)\u001F\u001F\u001F !\u001F\u001F\u001E\u001F \u001F\u001F \u001F\u001E \u001E\u001E\u001E\n@\u001A\u001A\u001C\u001E\u001B\u001D\u001B\u001C\u001A\u001C!\u001F \u001C\u001E\u001D!\u001D\u001F\u001F\u001C\u001F\u001F\u001E%\u001C\u001D\u001E$ \" !\u001E\u001F\u001D\u001E#! \nEU\u001D\u001A\u001C\u001C\u001A\u001B\u001D\u001B\u001B\nF^\u001B\u001F\u001D\u001D\u001D\u001A\u001E\u001C\u001D\nGs\nH\u0019\nH6\nH?\nHL $\"\"\u001F &!\u001F \u001F!$\nK\u000E9;\u000E\nL\u001A\nL-\nLE)%\u001D'(%#(%&%&%\u001E&&\u001F\nOq! !\" (\u001E\nQ%\"\u0018\u001C\u001C\u001E\u001D!\u0017!\nRF\nRP\nRf\nRi\nRk\nRm#\nS$\nS7\nS@\nSE\nSI\nSM\nS[\nS^\u001D\nS{\nT\u000F\nT\u0011\nT\u0013%\nT>;\u0017\nU\u0017!\nU?#\nUe\nUv\nV\u0015!!\"  !\nW!\nW1\nWB\nWL\nWP\nW\\\nWk\nWq\nWv\nWw\nWx\nX\u000E\nX\u0018\nX(\nX+\nX9\n\u0012&\n;\u0011\u001D\u001E\n;<\u0019\u001C\u0017#\n<\u0010\n<\u001C*,*+&\"##!)*()\" \",%)*\"&!\"!*&\"!*0\" !($## '$ \"#$$\"$# %\"#\"(\"\u001D%! *$!!$\u001F \u001F$%,&$&%#* %\u001E#% \"$&)+($ \u001B ## \u001A$ \nN^\u001D,\u001E\nO6\u001E \nOh\"&(%)&''&\nQm\u0018\u001B\nR\u001A\nR \u001E\nRA\u0013\nRI\u0018\u0018\u0019\nRm\n\u0012\u001C\n/\n;\u001E!\u001F\u001E\u001C# \"\"!!!\"\u001E $&\n=q&%%&\"\u001A\u001D!\u001F$&\n@\u0011'\"!\n@a\n@i\u001E\u001C\u001E\u001D\u001C\u001B\u001D\u001B\nAq\nA}\nB\u0016\nB\u001C\nB5\u001D\u001F\u001F\u001F\u001D!\nC2\u001E\nCM\u001E\u001C\u001D\nD\u0014\nD\u001E\nD/\nD6\u001A\u001C\u001D\u001D\u001D\u001D\u001D\u001C\u001D\u001C\u001C\u001D\u001B\u001B\u001B\u001B\u001B\u001D\u001C\nFW\u001E\u001F\u001F\u001D\u001D\u001E\u001E\u001F\u001D\u001F\u001F\nH+\u0018\u0015\u0016\u0015\u0015\u0015\nH^\u001E!   \u001D\u001D\u001B\u001C \u001F \u001E\u001D\u001F\nJv\u0018\u001C\nK+\u001D\u001F%\u001E\u001E\u001D\u001B ! \u001E\nL~\u0019\u001C\u001C\u001C\u001D\u001C\u001C\u001C\u001D\u001C\u001C\u001C\u001C\u001D\u001C\u001B\u001D\nO\u0017\u001C\u001E\u001C\u001D\u001D\u001B\u001C,\u001E\u001B\u001E\u001D\u001F\u001F\u001B\u0019\u001F\u001B\u001C\u001D%\u001F\u001B\u001A\u0019\u0018#\u001D\u001E\nR}\u001E\" \u001F\u001F\u001F\u001F \u001E\u001E\u001E\u001D\"\"!& !\"\n\u0012\u001C\u001F\u001E\u001D\u001F\u001E\u001F\u001D\u001E\u001F\u001D!\u001E\u001E\u001F \u001F \u001F \u001F\u001F\u001F  \u001E\u001F\u001F\u001F\u001E\u001E \"\u001E\u001E\u001E\u001D\u001E\u001F\u001E\u001F \u001F\u001E\u001E\u001E \u001E\u001E!\u001E\u001E\u001E\u001E\u001E\u001E\u001F\u001D\u001F\u001E\u001F \u001F\u001F\u001F\u001E\u001E\u001F\u001E\u001F\u001E\u001D\u001F\u001E\u001E\u001E\u001E\u001F\u001E\u001E\u001F\u001F\u001F\u001F\u001D\u001F\u001D\u001E\u001F\u001E  \u001E\u001F\u001E\u001F\u001F\u001E\u001F \u001E\u001E \u001E\u001E\u001F\u001E\u001E\u001F \u001E\u001E#\" \u001F \u001F\u001F \u001F!\u001F\u001E\u001F \u001B\u001D\u001C\u001C\u001D\u001C\u001C\u001B\u001D\u001D\u001D\u001B\u001E\u001D\u001D\u001D\u001D\u001D\u001C\u001C\u001C\u001C\u001B\u001E\u001B\u001D\u001C\u001D\u001D\u001D\u001D\u001E\u001C\u001D\u001C\u001D\u001B\u001D\u001C\u001D\u001C\u001D\u001D\u001D\u001D\u001E\u001C\u001B\u001F\u001C\u001D\u001D\u001E\u001E\u001D\u001C\u001E\u001E\u001C#\u001B\u001C\u001C\u001B\u001E\u001F\u001E\u001D\u001F\u001C\u001D \u001F\n\u0012(&* \u001F&!!'.-%''& '!&*'%'\"$% $%\"*\"&\",)'\"$1))+(*'# #\u0019\u0019\u0017\u0018\u001A\u001E\u001C\u0018\u001B\u0019\nEX#&))\"&)\"#&,)$\nHL+),%'%+\u001E#\u001A!\"%\u001F#$%\u001D\u001D \"\u001C\u0016\u001F#&&\"!\nMc((')/\"!8(\nP\u0018\"\u001E!\nPa\"!\"! \nQ]0%2'*$&0'*\nT+'\nTV\u001C\nTp\u0018\nU\u0013\nU\u001A\n\u0012!\"\u001E !\"\u001C\u001E!\u001F\u001E\u001F\u001E\u001F \u001E\u001D\u001F \u001C\u001F\u001E\u001E\u001F\u001F \u001E\u001F\u001D\n>r')$$\"#$##\"#\"($\"#!$\u001F\u001F&\nBo\nC)\u0012\u0010\u0010\u0010\nC5!$!\"! \u001F \"\"$\"## #$#$# \"!#\u001E \u001F!#\u001F#&\u001F\u001F  \u001D!!\u001F\u001F \" \u001E\u001D\u001E\u001F\u001D\u001D \u001F!\u001E\u001D \u001F\u001E\u001D\u001E\u001F\u001C\u001D\u001C\u001E\u001D\u001E\u001E\u001D\u001E\u001D\u001D \u001F\u001D \u001D\u001E\u001F\nO)\u001B\u001D\u001D\u001D\u001F\u001C\u001E\u001E\u001D\u001E\u001D\u001E!\u001D\u001E\u001D\u001F\u001E\u001C\u001C\u001E\u001E\u001D\u001D!\u001E\u001E\u001E! \u001E\u001E\u001F! !\u001F\u001D\u001D\n\u0012'/-\n;Y\u001E\n;z\u001E\u001A\"%#\u001C\u001C\u001E \u001E$!\u001C#\n>'\u0016\u0017\u0017\u0016\u0015\u0017\u0017\u0017\n>l\n?\u0015$\n?@\n?O\u001E !!!\"&#\"\nA+\nA3\nA6\nA7\nA<\nA>!\nA`\u001F\nB\u0010\u001E \u001D\u001D\u001C\u001F\u001C\u001E\u001F\u001F\"!%#\"%!#$%!\u001D\u001F\u001F$! \"\" \u001F  &!$%\" \u001F  ! \u001E\u001F$(\"'\u001F\u001E\u001F# !&\"\u001F \"\u001B\u001C!\u001D\u001E \u001D! \u001C\u001E\u001E!%\u001F &!$\u001F\u001E\"!!$&&##$\"#\"\"$%&$\nR\u0014\nR# \"!\"!\u001E+\"9\nT\u0019'!   \u001F\u001E\"\nUI\nUW \u001E\n\u0012\u001D !!!\" \"\"\n<%\n<*\n<0\n<C\n<P\n<Y\u001B\u001B\u001C\u0018\n=#%\n=Q$\"\n>\u001D\u001E&\n>W(%&!,&%#((+(&(\nAi\u001E\u001D\u001B\u001D\u001F\u001C \u001E\u001F\nC\u001D \u001E!\u001F\"\u001E\"!%\nD] #\"$& '&)\nFP$\nFx\u001C\u001D\nG/\nG7\u001F  \u001E\u001E\u001D\u001E\u001D\u001D\u001E\u001D\u001C\u001E!\u001F !\u001D \nJ\u0019\nJ+!#\"\u001E\u001F\u001E \u001E \u001D\u001F#\nL&\u001B\u001C\u001D \u001C\u001C\nM\u0013 \u001D\u001D\u001D\u001E\u001F \u001D\u001B\u001D\u001E\u001D\"!\u001B\nO \nO*\nO5\nOG$$ \nP$+ *\nQ\u001D\nQ$\nQ2\nQ3\nQC\nQV \nQx\nR\u0013\nR\u0016\nR\u0018\nR\u001A\nR\"\nR$\nR&\nR/\nR6\n\u0012\n!\n0\n7\n;(\n;8\n;N#\n;w\u0017\u0016\u0017\u0018\u0017\u0017\u0016\u0017\u0016\n<S\u0017\u0016\u0019\u001B\u001B\u0018\u0018\u001A\u0018\u0017\u0018\u0017\u0017\u0017\u0015\u0015\u0013\u0015\u0015\u0015\u0019\u0017\u0019\u0019\n>C\u0015\n>Q\u0016\n>`\n>e\n>j\n?\u001A\n?\"\n?%\u001F$\u001E\u0018\u001B\u001D\u001E(!\n@S \n@z(**#*'(*'),)%+%\nDN( \u0018\nE'\u001D\u001E\u0018 ! \u001F!\u001D\"\u001D\nFq\u001A\u001A\nG!\u001A\nG8\nG<\nGI\nGT\nGX\nG^\nH\u0011\nH\u0017\nH\u001B\u001C\nH5\u001C\u001B\u001A\u001C\u001B\nH}\nI\u0013\u001A\u001E\u001C\nIJ\nIM\u0016\u0016\u0017\nIi\nIq\nJ\u0019\u001E\nJ2.2++%#!\u001E$\nL7\u0016\u0014\u0013\u0018\u0013\u0016\u0012\u0013\u0011\u0012\u0011\u0011\u0011\u0012\u0010\u0012\u0011\u0011\u0015\nM\u0012\u001E/ \nM]\u0015\u0015\u0014\u0016\u0015\u0016\u0016\u0017\u0015\u0016\u0015\nN;\nNC\nNL\nNV\nN\\\nN^\nN_\nN`\nNb\nNm\u0016\u0016\nO\u0011\nO\u0014\nO\u001B\nO\u001D\nO\u001E\nO%\nO)\nO?\nO@\nOH\nOK\n\u0012\n+)\n;-36\n<.\n<>\n<R\n<m4)*\n=t;\u0013\n>_(\n?\u001C+,*--\u001D\n@Y\n@z&\nA3\" \u001F!\nB%\u001F\u001E,\nBz:;\u000F\nD\u001E;3;#\nF\u000E;3;A\nHG-\nI\u0010\nI,\nI6\"\nI_\nIh45929;\u000E8\nL\\255::;\u000F754\nP*&&''&%&$%&#$)#%$%#%\n\u0012;\u00109;\u0010;\u000F9;\u0011;\u0011:;\u000F\n>T;\";#;!;\u001D;!;\u001A;\";\u001F;\"\nD$//\"'*-(+,\nFP;\u0010;\u0012;\u00144;\u0010;\u0011;\u0011;\u001F;\u0010;\u001B*\nK>\nKs; ;&;\u001A;\";&;!; ;\u0013;!\nQ0\nQ`\nQs&\nR/&*\"\nS\u0015'\nSB\u001E\u001F!\nT\u001C4;\u0015\n\u0012\n7;\u001B;\u0011;#;\u0018\n=A;\u0018;#;\u001E;/;\u001E;(;\";\u001E;\u000F9;\u0017;\u001A;\u0012;#; ;\u0017;$;*;\u000E\nG[\nG{\"(*$%(%\u001F\u001F!*+*'+('!*\u001E &\"*2%%%$1*$*-*'##!'\"!$#,'%\"*$ !('#++%$\n\u0012*$&'\")(\"''''*#$+(*&%&'#%!'$)$'('$)&%&)($'*()+',%)'+('''+(-).(*'+%%%%&'$\u001E#\"# #!),'&!%'\u001F!\"%\nM(\nMA\nMc\"#!#\"$!%$##$%$&%&&&$'\"'%$&##%&$%$\"&&*''\nU:\nUC+,,\nVD&\nVq\n\u0012;1;@\n=\u00117\n=^\n=x\n>\u001A1;\u000F\n?%\n?M\n?g#$\"#\u001C\n@i\nA\u001D!,*\nB\u0010#(\nBa\nBe\nBo\nC5(!\nCn\nCv\nD\u0016\nD,\nDT\"\u001D\u0012\u001F\u001D\u001E!\u001F \u001F\u001B\u0017\u0015\u0012\u001C\u001B\u0013% \u001F\u0015\u0018\u0017\u0017\u0014\u0012\u0015\u0014\u0013\u0015\u0015\u001B\u0013\u0014\u0012\u0017\u0012\u001C\u001B\u0014\u0017\u0013\u0013\u0014\u0017\u001E\u0017\u0014\u0014\u0017\u001A\u0018\u001B*\u001B\u001A\u0018\u0010\u0016\u0019\u0018\u0013\u001A\u0017 \u001F\" \u001C\u0019\nJr;;;9;8;7;7;8;<;<;8\n\u0012$\n;\u000F$\"#\n;_!\u001E\u001E   ! %!,)\u001D\u001D \u001A \u001F !\u001F  \u001F\u001D\u001E!!\u001C\u001D$\u001F\n@_\n@z\nA?\u0019\nAQ\nAm9\nBL\nBX\nC/2/0..+!#/\nEg;);0;-\nH:\u001F''$$\nIL;\u0018;\u00112;\u0010;\u000F;\u0015;\u001315\nME;\u0013858:673:\nQ+-\u001D'%&$$\nRa;\u001018;\u00127\nT|;\u0015;(;!;\u001E;\u001C\n\u0012 \n4\u001F\"!!\u001F\n;m#!$%\u001E\n<k67;\u001152\n>o\n?+;\u0016;2;E;I;A\nC_;(;\u001C;\u0018\nEu\nF\u001B&(&%''%%!\nH\u0010\u0014\nH'\nH2\nHG;3\nI}:4/-/10,/11*-+-,*-/\nOP)\nP\u0015\nPB;\u001F;\u00147;\u001734+;\u00179\nT1\nTL\" '\nU-\nUD;\u0011\n\u0012;i<!\n>f= =A\nF\u000E77\nFt5\nGZ,\nH#,*\nHt)'\nIM(\nJ\u0010,\"\nJQ2$*'&\nL\u00119\nLu/\nM];';)\nO;\nOA;\u000E:\nPK*\nQ\u0012\n\u0012;F;\":;&;\u001D; ;\u000F364$';\u00146; 74;\u000E;\u0019+9.9;\u000E2;\u001E8;\u00111\nFV;`;\u00155;\u0013;\u000E;\u0019-,0, $6/1(%+9)8-1.,200(\nP$7%!'\u001F\u001F\u001D\u001F\u001E\u001F\"\u001C\u001E !\u001E\u001F#\u001F\u001D!\u001A!\u001F\u001E \u001F\u001E\u001C\n\u0012;\u001B9;\u001B;\u0014;\u001C78;\u0012;\u0013\n?\u001F;'$\n@**\n@e;6;4\nBp;-;(;\u0019;$;1;!;&;5;.;0;\u001A;);+;);$;#;(;0;8;&;(;&;!\n\u0012;\u00189;\u0014;\u0015;\u001817-+,8;\u0013;!;\u000E;\u0011\n@\\;S;b;S;\\;Y;V;S;N;G\nJ`;2\nL\u001A;%;1;\u0019;\u001B;-; \nP\u001E;';3;-;';\u001E;#\nTQ7\n\u0012:;\u0011\n;l\u0018\n<\u000F\u001B\n<(\n<X\n=\u0012;\u0017;\u001A\n><\n>j\n?+;\u000E\n?|9\n@S\nA\u000E/;\u0010\nB)\nBF!\u001F!\u001E!!\u001F  \u001E!\u001F ! !\u001F\u001E \nED\nEk\"'&\"\"\nFz;);%;:;!; ;\u0011;\u0017; ;\u0018;!; ;$; ;\u0019:;\u0016;.;\u001F;\u0013\n\u0012\n;\u000F-.8:\n<Y;\u00103\n=\\\n=o%#\n>=\n>Q\n>t6;\u000F\n?y2;\u0010\nA\u001B;';0;$;\u000F4;\u0010\nDN)3\nEA7+'\nFK\nG\u0011\u001E\nG-&%$\nH\u001C\nH+\nH:+\nHo13;\u0010\nJ,\nJB\nJF'\nJr#\nK+\nKI\nKV\nKr\nL\u0011\nL&\nL2\nL>\nLA\u001F\nLc\nL~&\nM;\nME;B\nN~\nO\u001F\nO%\nOY\nP\u0012\nP6$\nPc\nPs$\nQ0%\nQ[\nQj\nR\u0012$\nR=\nRM\nRO\nRR\nRV\nRk\nRt\nR~\nS\u0017\nS\u0019 \u001B\u001F\u001D\u001B\u001C\u001B\u001A\u001E\nT0\u001A\u001B\n\u0012-.:6;\";\u0012;\u0012;\u000F;\u000E\n>6;];J;L;.;};7;A;#;&\nFD!\nFh\nFq\nG')&,$(&\u001E\"\u001F\nI#\nI7%\u001B\"\nJ\u0012\nJ\u001C\nJ%% %$\nK\u0019\nK-\u001F\nKU!\" \nL*0-\nM\u001D\nM,\nM2(\nMc\u001C\u001A\u0017\u001A\u001A\u001D\u0019\u001D\u001B\u001C\u001B\nO\u0011\nO\u001F\nO5\nOE\nOY$''\nPE\nPZ1\nQ4,*/3-,\nS<\nSD\nSW\nSi\nS}\nT\u000F\nT\u000F\nT\u0011\nT\u001E\nT$\nT+\nT1\nT@\nTP\nT^\nTj\nTn\nTq,\nU5\n\u0012\n\u001B.\n;%\n;=##\"#\"$\n<X\n<f\n<k#$\n=8\n=K\n=h\"\n>!\u001B\u0019\n>A\n>K;\u0015;\u0016;\u000F;\u0014;3\nA-\"\u0014\u0017\u001B\u001B\u001F\u0014\u0013\u0019\u0015\u0018\nB0\nB7\nBW#&\u0016'\u0018\u001F\u0017\u0019\u0013\nD\u00103\nD`\nDl%\u0018\u0019\u0018\u0017\u0015\u0016\u001F\u0018\nEc\nEf\nEq\"\nF*\nFG\nF`,\nG&%\nGV\nGc\nH\u0016\nHP:\nI\u0016*8\nIw\nJ\u0015\nJ'\nJ:72\nK3\nKR\nKm%!\nL8%*$ #\nML\u001E\u001D\u001D\u001F\u001D\u001C\u001E\u001D\u001C\u001E\u001E\u001E\u001D\u001E\u001F\u001E\u001E\u001D\u001D\nP\u001E\u001D\u001D\u001C\u001D\u001A\u001C\u001B\u001C\u001E\u001F\u0016\u001D\u001B \u001F\u001A\u001D\u001A\u001B\u001C\u001B\u001D\u001D\u001D\u001C\u001C\u001E\u001C\u001D\nT\u0012\nTa+.'&\u001E-#$/\n\u0012;\u0016+%;%;\u0012\u001F\u001F;\u0015\n=k!\n>04.()$%$%'\n@S223&1\nB7\nBO#$&\u001B\u0019\nCM\nCf\nD0\nDR\nDT\nD[\nDs\nE\u001B\nE )\nEU\"# \u001F \"\u001C\u001E(!\u001C\u001E\u001D\u001F\u001E\u001F & \u001E\"\u001E''\u001F! ,$\u001E\u001E  #!'\"% \u001E!\u001F\u001F\" #!\u001F $ \u001A\u001C\u001D\u001C\u001E\u001E \u001A\u001C\u001F\u001E\u001C\u001B  \"\u001B \u001C\u001D\"\u001B\u001D\u001D\u001B\u001D\u001F\"!\u001B \u001F\u001C\u001C\u001E\u001C\u001E\u001F\u001D\u0019!\u001C\u001E\u001B\u001D\u001B \u001D\nT\u001129\nT~\nU\u001D\nU1\nU=\nUQ!\"!\nV)&\u001F \"\u0019\u001F\" \"\nWc\nX\u0016!'$!#!!\n\u0012\n\u001C\n$\n,\n5\n;\u000F\n;\u0016\n;\u001E\n;&#\u001E;\u000F\" $\"&\" %%!\u001E\n>\u00121!;\u0016\u001F))\u0019\u001D#)\u001B\u0018\u0018\u001F\u001F\u001C\u0018\u0016\u0011\u0010\u0018\u0018\u0018'\u0017/.*$\u001E($$\u001A,-\u001F 3\"#,'\"*!%%# \u001D *\nG-7\u001D\"%)&-+.)4529;\u000E983;\u0014;\u0012;\u000E\nN\";Z;L;n\nRP;\u0018;\u001A\nSw;\u00199;\u0011)\n\u0012;{0\u001E(\n<n\n=)\u001C\u001D\u001C\u001C\u001F\u001D\n>\u0019\u001B\u001A\u001E\u001A\u0014\u0019\u001D\u001B\u001C\n?\u001C\n?\"\n?C\n?F\n?N\n?R\n?[\n?p \u001C\n@/\n@C %\" #\u001D\u001F\u001F&\nB\u0013\nB1\nB8\nB?\nBF\u001B\u001A\u001C\u001C\u001F\nC\"%%*\u001E\"))(\u001F#( *\nEs$&$6')$*)%##,$2/.'*;\u001A$/'1;(0& +\nM?\u001F\u001F #\"$)\"  \"\"!)$\"'''##\u001F$\u001D! \u001F\u001E!\nRJ\u001C\u0017\u001B\u0017 \u001F\u001D\nS<\u0018\u001D\u0018\nSg\"#&%($)%\nUM\u001E\n\u0012 \n4\u0015\u0019\u001B\u0015\u0018\u001D\u001B\u001E\u0015\n;s\u001D\u001C\u001D\u001D\u001F\u001F\u001F\u001F\u001E\n=#\n=8\n=E!\"\n={23\n>Z\u001E\u001A\u0019 \n?&\n?7\n?k: $2.!\u001E%+(&2'((),+%-+&,-11'1&\nG\u0015\u001D'\"\u001D!\"\" \u001F $/(,#&\"#!(%)$\u001E+\"$)%##,\u001F\u001F\u001D\nMQ\u001A$\"!#\u001C(\"\nO\u0010\nO\u001F\u001B\nO=\u0015\nOH\u001A\u001F\nOt2\nPK12\nQ7\nQT\nQV'$!\u001F\u001F! ($\"$\nSf7\nTF\nU\u0014\nU\u0019\nU\u001D \u001F\u001A\u001C\nUc\nUh\nUj% \u001D \nVK\nVV45\nWT\u001A\nWm(+\nXJ\u0019\nXb\n\u0012($\u001F &'\u001E!\")%,\u001F\n=#\u001B \u001E! \u001F#(*%(%2&9\u001B'.($!-+)21;\u001798\nD*)&'\nE \nE4*-\nF \nF8 !\u001E\u001E \nG&(\nGS% %/\u001B5\u001F\nI)\u0018\u0017\nIC\u0019\u001D\nIk$ )!%%\u001D#\u001C\nKI\nKf& \u001D\u0018\u001E\u001E!%\" #!\"\u001D! \u001A\u001C\nNL!)\u001F\u001E\nO5\"\nO]\" \u001F\u001A\nP3\nPM# \"\u001E\u001F\n\u0012!\u0018\u001E\u001C\u001E&$$\u001A! \u0016\u001F$! \"$(\u001A\u001C\u001B%&\u001B\u001E\u001D\u001D\u001D\u0017'&!\u001B\u001C!\u001C\u0019\u001C\u001D\u001D\u0016 %\u001B *\u001E\u001C\nAc)'%'-0//.3 -\",\u001D\"'\"$$.#'$$\u001F!+++5,1%4-\u001D'%#\u001D%#\u001F!&\" )\u001D\u001F'%#:&%\u001A\"+!1*-)\u001C!''%$'\u001E\u001C$\"\"\u001C#\" $\u001E \u001E) *1$+$%\" '%'!\n\u0012&0(/)/,1*;\u000F\u001F/*/+%/**\n?g\n@\u0013%$%\n@k$$\nA@;\u001E;\u0015\nBp#\u001F\u001E ! \u001C#\"$\"\"\"\"(!#\" \u001F'%(!*,0#\u001F\"&$!$ \u001F\u001F\u001E$%&$)!!\"()\u001F\u001D\")!\"\u001F(#&%!!% \u001F \u001D\u001D\u001D\u001E%\u001E\u001F\"\"%$\" \u001C&#\"&\u001F\u001C\u001B\u001E\u001F\u001C\u001B\u001E\u001A\u001C\u001F\u001B\u001B!\u001F \nS<\u001D\u001C\u001D\u001D\u001F\u001F\u001B\u001B\u001D\nTX.-!\u001E\"*!)\"\nVT;\u001E;\u001A;\u0013;\u0017;\u001B;\u001E\nZ\u0019\nZ%\nZt\n[\u0017\n[N\n[Y\" \n\\\u001D\n\\'\u0014\n\\4\n\\P\n\\d\n\\j\n\\l\n\u0012\u001C-!;\u0012\u001F\u001B\u001F)(%!4\u001F$\n=Y(\u001C  \u001E\u001D\n>Q!!.\u0017\n?<(&/ \n@>%;\u00166:81\".7\nC\\\nCn\u001E\u001E\u001F\nD8\nDG& ! !\u001D&*$\u001E\u001F;\u0012)\u001E\nG-.;\u0010*23+'.,+6;\u0010;\u0011270+)0\nMl!$\u001F\nND,(\nO\u0017\"%'$)2$&(*$#\"$$\u001F #!+17;\u00116;\u000F5;\u0011(;\u000E\nV?\nVT\nV^\nVd\nVu\nV}\nW\u0015\nW\u001C\nW#\nW)\nWE\nWR\nWT\nW]\nWb\nWp\nX\u0011\nX\u001D\nX!4\nX[\nXc\nXi\nXl\nXr\nY\u000E\nY\u0011\nYL&\u0014\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\u0012\n);\u000E\n<\u000E\n<9;$\n=H\n=h\n>\u0013\n>\u001D\n>,\n>6\n>^\n>e\n>o\n?\u0010\n?\u0014\n?\u001A\n?\u001C\n?:\n?V\n?f\n?s\n@\u0015\n@\u001C\n@9\n@k\n@m\n@q\n@|\nA(\nA4\nAM\nB\u000E\nB\u00139\nB[\nBa\nBo\nC5\nCU\nD\u0012\nD.\nDP;'\nEo\nF\u001A\nF\u001F\nF)\nF/;E\nGv;\u0015\nHm\nHo\nHy\nI\u0013\nI9\nI=\nIA\nIL\nIY\u001B;)\nJ}\nK`\nKy\nK|\nL\u001A\nLB\nLd\nLz9\nM]\nMu\nN:\nNj*\nO9\nOz;q;H\u00115;\u0016\nSG\u0017\u0016\u0016\nSe\nT\"\nT\\'\nU\u001E\nUA\nUd\nV\u001B\nV9\nVs\nV{\nWI;\u0012\nX:;\u0014;\u0018\nYf\nYr\nZ\u0010\nZ\u0013\nZ-\nZ<\nZQ\nZT\nZW\n[\u0017\n[\u001F\u001A\n[>\n[R6\n\\'\n\\(\n\\.\n\\0\n\\4\n\\5\n\\=\n\\K\n\\V\n\\Z\n\\r\n\\t\n\\x\n\\z\n\\~\n]\u000E\n]\u0011\n]\u0013\n]\u0017\n]\u0018\n]\u0019\n]\u001B\n]\u001C\n]\u001D\n]\u001F\n] \n]&\n])\n]-\n]/\n]1\n]G\n]X\n]Z\n]`\n]a\n]d\n]g\n]k\n]m\n]q\u0013\n^\u0010\n^\u0016\n^\u001F\"\u001B\n^R\n^S\n^[\n^]\n^b\n^c\n^c\n^g\n^x\u001B\u001C\n_+\n_4\n_8\n_H\n_K\"\n_k\n_p\n_r\n_u\n_u\n_w\n`\u0012\n`\u0015\n`\u001D\n`!\n`%\n`8\n`A\n`C\n`T\n`V\n``\n`|\na\u000E\na\u0010\na\u0018\na\"\na&\na*\na+\na.\na2\na5\na7\na=\na>\na>\na@\naA\naB\n\u0012\u001E\u001E\u001F\u001D \u001F\u001F\u001F\u001F  !\u001F\u001F\u001D\u001E\u001F\u001F!\u001E\u001D\u001E\u001E\u001E$\u001E \u001F!\u001E\u001F\u001F!\u001F\u001E\u001F\u001F\u001F \u001E\u001E\u001E\u001F \u001F\u001E\u001E\u001E\u001F ! \u001E\u001F\u001F\u001D\u001E\u001F\u001F\u001E\u001E\u001E\u001F\u001E\u001E \u001E\u001F\u001F\u001E\u001F\u001E\u001E\u001F!\u001E!\u001E\u001E\u001F !\" \u001F\u001E\u001E\u001E\u001D\u001D\u001E\u001F\u001E\u001F\u001F \u001E\u001F\u001D#\u001D\u001F\"\u001F\u001D\u001F \u001F\u001E\u001F\u001E \u001F\u001E\u001F\u001E\u001F\u001F  \u001F   \"     \u001F \u001F \u001F\u001E \u001F\u001F\u001F!\u001F\u001F\u001F\u001F\u001F \u001E\u001F!\u001F!  \u001E    \u001F\u001F\u001F \u001E\u001F\u001E\u001E\u001F\u001F\u001F\u001F \u001F #\u001F\u001F\u001F\u001F\u001F\u001F \u001F\u001F\u001F\u001E\u001F\u001F  \u001F\u001E  \u001F  \u001D\u001E\n\u0012!\u001F  \u001E !!\u001F \u001F   \u001F  \u001F\u001F!\u001F\u001F\u001E\u001E\u001F\u001F\u001F\u001F\u001F  \u001F\u001E\u001F\u001F\u001F! \u001E\"\u001F\u001F \u001F\u001E\u001F \u001F\u001F\u001D\u001F\u001F\u001E\u001F\u001F \u001F\u001F  \u001E\u001F\u001E    \u001F \u001F \u001F\u001F\u001F\u001F\u001F\u001F$  \u001F\u001F !   !\u001F\u001F\u001F \u001E\u001F\u001F \u001F\u001F !\u001F !!  ! #\u001F! ! !   !#!! !\"!  \u001F\u001F \u001F\u001F\u001F\u001F\u001F# \u001F\u001F!\u001F\u001F  !\u001F   !  # #   \u001F \u001E\u001F\u001E \u001E\u001E  \u001E \u001F\u001F \u001E\u001F\"\u001F !\u001F \u001E\u001F\u001E\u001D\u001F\u001D  \u001E\u001E   !\u001F!!";

var fixJuanT = function (bkno, juan, sutraname) {
    var bk = '';
    if (juan === 1) {
        bk = '^bk' + bkno + '【' + sutraname;
    }
    if (bkno === '946') {
        if (juan >= 4)
            juan--; //946 其實只有四卷, 缺檔 _003
    }
    else if (bkno === "2799" || bkno === '2825') {
        if (juan === 3)
            juan = 2;
    }
    else if (bkno === '2805') {
        if (juan === 5) {
            bk = '^bk#' + bkno + '【' + sutraname;
            juan = 1;
        }
        else if (juan === 7)
            juan = 2;
    }
    else if (bkno === '2139') {
        if (juan === 10)
            juan = 2; //workaround 老子西昇化胡經
    }
    else if (bkno === '2772') {
        if (juan === 3) {
            bk = '^bk#' + bkno + '【' + sutraname;
            juan = 1;
        }
        else if (juan === 6)
            juan = 2;
    }
    else if (bkno === '2748' || bkno === '2754' || bkno === '2757'
        || bkno === '2764b' || bkno === '2769' || bkno === '2803' || bkno == '2809'
        || bkno === '2820') { //only 1 juan
        bk = '^bk<id=' + bkno + '【' + sutraname;
        juan = 1;
    }
    return [bk, juan];
};
var parseBuffer = function (buf, fn, ctx) {
    var _a;
    if (fn === void 0) { fn = ''; }
    // if (fn) process.stdout.write('\r processing'+fn+'    '+buf.length);
    buf = buf.replace(/\r?\n<lb/g, '<lb').replace(/\r?\n<pb/g, '<pb');
    ctx.rawContent = buf;
    var el = DOMFromString(buf);
    var body = xpath(el, 'text/body');
    var charmap = buildCharMap_cbeta(el);
    var m = fn.match(/n([\dabcdefABCDEF]+)_(\d+)\.xml/);
    var bk = '', bkno = '', chunk = '';
    var sutraNo = m[1].replace('_' + m[2], '').toLowerCase();
    var sutraname = ctx.catalog && ctx.catalog[sutraNo] && ctx.catalog[sutraNo].trim() || '';
    bkno = sutraNo.replace(/^0+/, '');
    var at = sutraname.indexOf('^');
    if (at > -1) {
        sutraname = sutraname.substr(0, at) + '】' + sutraname.substr(at);
    }
    else
        sutraname += '】';
    var juan = parseInt(m[2]);
    if (fn[0] == 'T') {
        _a = fixJuanT(bkno, juan, sutraname), bk = _a[0], juan = _a[1];
    }
    else if (juan === 1) {
        bk = '^bk' + bkno + '【' + sutraname; //empty sutraname
    }
    chunk = '^juan' + juan;
    if (!ctx.teictx) { //cross multiple file
        ctx.teictx = { defs: ctx.labeldefs || {}, lbcount: 0, hide: 0, snippet: '', volumname: ctx.volumname || {},
            div: 0, charmap: charmap, fn: fn, started: false, transclusion: ctx.transclusion || {}, milestones: ctx.milestones || {} };
    }
    ctx.teictx.sutraNo = sutraNo;
    ctx.teictx.started = false;
    var openhandler = Object.assign({}, onOpen, ctx.onOpen || {});
    var closehandler = Object.assign({}, onClose, ctx.onClose || {});
    var content = bk + chunk + walkDOMOfftext(body, ctx.teictx, openhandler, closehandler);
    ctx.teictx.out = '';
    content = content.replace(/\^r\n/g, '\n').replace(/\n+/g, '\n');
    return content;
};
var tidy = function (content) {
    return content.replace(/([、，；]?)<caesura[^>]*\/>/g, function (m, m1) { return m1 || '　'; });
};
var parseFile = function (f, ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var fn, ext, xmlcontent, _a, nullified, parsed, lines, i, line;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                fn = f;
                if (typeof f.name === 'string')
                    fn = f.name;
                ext = fn.match(/(\.\w+)$/)[1];
                if (!(ext == '.xml')) return [3 /*break*/, 2];
                _a = tidy;
                return [4 /*yield*/, fs.promises.readFile(f, 'utf8')];
            case 1:
                xmlcontent = _a.apply(void 0, [_b.sent()]);
                nullified = nullify_cbeta(xmlcontent);
                if (ctx.postNullify) {
                    nullified = ctx.postNullify(nullified);
                }
                parsed = parseBuffer(nullified, fn, ctx);
                lines = parsed.split("\n");
                for (i = 0; i < lines.length; i++) {
                    line = lines[i];
                    if (!(line.startsWith('^h') || line.startsWith('^bk'))) {
                        lines[i] = breakChineseSentence(line);
                    }
                }
                return [2 /*return*/, lines.join('\n')];
            case 2: throw "unknown extension " + ext;
        }
    });
}); };
var translatePointer = function (str) {
    var m = str.match(/([A-Z])(\d\d)n(\d{4}[abcde]*)_p(\d\d\d\d)([abcdef])/);
    if (m) {
        m[0]; var zj = m[1], vol = m[2]; m[3]; var page = m[4], col = m[5];
        return '/cb-' + zj.toLowerCase() + '/v#' + vol.replace(/^0/, '') + '/p#' + page.replace(/^0+/, '') + col;
    }
    return '';
};
var fromCBETA = function (cbeta) {
};
var toCBETA = function (address) {
};
var TaishoMaxPage = [0, //每一冊之頁數
    924, 884, 975, 802, 1074, 1073, 1110, 917, 788, //1
    1047, 977, 1119, 998, 968, 807, 857, 963, 946, 744, //10
    940, 968, 1072, 1057, 1122, 914, 1031, 1004, 1001, 977, //20
    1035, 896, 790, 963, 1008, 963, 1066, 903, 1114, 1040, //30
    857, 982, 868, 1009, 875, 978, 1013, 1064, 1160, 1019, //40
    1023, 1140, 860, 1030, 1290, 1178, 828, 782, 22, 802, //50
    782, 810, 802, 970, 778, 796, 926, 916, 778, 866, //60
    840, 912, 768, 726, 822, 960, 888, 878, 918, 824, //70
    760, 724, 786, 930, 906, 1464]; //80~85 
var TaishoVolSutra = [
    1, 99, 152, 192, 220, 220, 220, 221, 262, 279,
    310, 321, 397, 425, 585, 656, 721, 848, 918, 1030,
    1199, 1421, 1435, 1448, 1505, 1519, 1545, 1546, 1558, 1564,
    1585, 1628, 1693, 1718, 1731, 1736, 1744, 1765, 1783, 1804,
    1821, 1824, 1829, 1835, 1852, 1911, 1957, 2001, 2026, 2040,
    2066, 2102, 2121, 2123, 2145, 2185, 2201, 2211, 2216, 2218, // from sat
    2221, 2246, 2249, 2251, 2255, 2263, 2266, 2267, 2272, 2291,
    2309, 2326, 2341, 2347, 2385, 2409, 2411, 2461, 2501, 2543,
    2562, 2580, 2608, 2680, 2732,
    2921 //terminator
];
//經號以純數字表達，作為陣列的index , 後綴a,b勿略
//頁碼/3 ，餘數為欄
//大般若經220 6冊為 2921 號, 7冊為2922 號
var TaishoJuanPage = TaishoJuanPagePacked.split(/\n/).map(unpackIntDelta);
//給定經號和卷數，返回冊頁碼
var TaishoPageFromJuan = function (sutranumber, juan) {
    if (juan === void 0) { juan = 1; }
    if (typeof sutranumber !== "number")
        sutranumber = parseInt(sutranumber) || 1;
    var vol = bsearchNumber(TaishoVolSutra, sutranumber + 1);
    if (sutranumber == 220) {
        if (juan > 400) {
            juan -= 400;
            sutranumber = 2922;
            vol = 7;
        }
        else if (juan > 200) {
            juan -= 200;
            sutranumber = 2921;
            vol = 6;
        }
        else {
            vol = 5;
        }
    }
    var jpage = TaishoJuanPage[sutranumber - 1];
    if (!jpage)
        return [0, 0, 0];
    var pgcol = jpage[juan - 1] || 0;
    return [vol, Math.floor(pgcol / 3), pgcol % 3];
};
//給定冊頁碼，返回經號和卷數
var TaishoJuanFromPage = function (volpage, page, col) {
    var _a;
    if (page === void 0) { page = 1; }
    if (col === void 0) { col = 0; }
    var vol = volpage;
    // input format:   "35p77c" , or    35, '77c'
    if (typeof volpage == 'string') {
        _a = volpage.split('p'), vol = _a[0], _page = _a[1];
        if (_page)
            page = _page;
    }
    if (typeof page == 'string') {
        var m = page.match(/([bc])$/);
        if (m)
            col = m[1].charCodeAt(0) - 0x61;
        page = parseInt(page);
    }
    vol = parseInt(vol);
    if (isNaN(vol))
        return [0, 0];
    var pn = page * 3 + col;
    var startsutra = TaishoVolSutra[vol - 1];
    var endsutra = TaishoVolSutra[vol];
    if (vol == 5) {
        startsutra = 220;
        endsutra = 221;
    }
    else if (vol == 6) {
        startsutra = 2921; //TaishoJuanPage 第6冊的虛擬經號為2921
        endsutra = 2922;
    }
    else if (vol == 7) {
        startsutra = 2922;
        endsutra = 2923;
    }
    for (var i = startsutra; i < endsutra; i++) {
        var pages = TaishoJuanPage[i - 1];
        var at = bsearchNumber(pages, pn + 1);
        if (~at && pages[at] >= pn) {
            if (i == 2921) {
                return [220, at + 200]; //大般若經 200~400
            }
            else if (i == 2922) {
                return [220, at + 400]; //大般若經 400~600
            }
            if (i > 0 && at == 0) { //return last juan of previous sutra
                return [i - 1, TaishoJuanPage[i - 2].length];
            }
            else {
                return [i, at];
            }
        }
    }
    return [0, 0];
};
var getSutraInfo = function (ptk, no) {
    var catalog = ptk.columns.catalog;
    if (typeof no == 'number')
        no = no.toString().padStart(4, '0');
    var at = catalog.keys.indexOf(no);
    return { title: catalog.title[at], bulei: catalog.bulei[at], author: catalog.author[at], no: no };
};
var TaishoSutraCode = {
    1: 'agmd',
    26: 'agmm',
    99: 'agms',
    100: 'agmss', //shorter samyutta agama
    125: 'agmu',
};
var nextColumn = function (obj) {
    if (obj.col === 2) {
        obj.col = 0;
        obj.page++;
    }
    else if (obj.col < 2)
        obj.col++;
    return obj;
};
var meta_cbeta = { translatePointer: translatePointer, parseFile: parseFile, parseBuffer: parseBuffer, onOpen: onOpen, onClose: onClose, createChunkId: createChunkId_cbeta,
    insertTag: insertTag_cbeta,
    offGen: offGen_cbeta,
    buildCharMap: buildCharMap_cbeta,
    StockCharMap: StockCharMap_cbeta, parseRefTarget: parseRefTarget, TaishoMaxPage: TaishoMaxPage, TaishoVolSutra: TaishoVolSutra, TaishoJuanPage: TaishoJuanPage, TaishoSutraCode: TaishoSutraCode, tidy: tidy, getSutraInfo: getSutraInfo, TaishoJuanFromPage: TaishoJuanFromPage, TaishoPageFromJuan: TaishoPageFromJuan, fromCBETA: fromCBETA, toCBETA: toCBETA, parseVolNoPage: parseVolNoPage, //行首格式
    nextColumn: nextColumn, nullify: nullify_cbeta };
addTemplate('cbeta', { TaishoMaxPage: TaishoMaxPage, guidedrawer: 'cbeta' });

/* return first paranum by Cluster name*/
var FirstPN = {
    d1: 1, d2: 150, d3: 254, d4: 300, d5: 323, d6: 359, d7: 378, d8: 381, d9: 406, d10: 444, d11: 481, d12: 501, d13: 518, //dn1
    d14: 1, d15: 95, d16: 131, d17: 241, d18: 273, d19: 293, d20: 331, d21: 344, d22: 372, d23: 406, //dn2
    d24: 1, d25: 49, d26: 80, d27: 111, d28: 141, d29: 164, d30: 198, d31: 242, d32: 275, d33: 296, d34: 350, //dn3
    //mn1
    m1: 1, m2: 14, m3: 29, m4: 34, m5: 57, m6: 64, m7: 70, m8: 81, m9: 89, m10: 105,
    m11: 139, m12: 146, m13: 163, m14: 175, m15: 181, m16: 185, m17: 190, m18: 199, m19: 206, m20: 216,
    m21: 222, m22: 234, m23: 249, m24: 252, m25: 261, m26: 272, m27: 288, m28: 300, m29: 307, m30: 312,
    m31: 325, m32: 332, m33: 346, m34: 350, m35: 353, m36: 364, m37: 390, m38: 396, m39: 415, m40: 435,
    m41: 439, m42: 444, m43: 449, m44: 460, m45: 468, m46: 473, m47: 487, m48: 491, m49: 501, m50: 506,
    //mn2
    m51: 1, m52: 17, m53: 22, m54: 31, m55: 51, m56: 56, m57: 78, m58: 83, m59: 88, m60: 92,
    m61: 107, m62: 113, m63: 122, m64: 129, m65: 134, m66: 148, m67: 157, m68: 166, m69: 173, m70: 174,
    m71: 185, m72: 187, m73: 193, m74: 201, m75: 207, m76: 223, m77: 237, m78: 260, m79: 269, m80: 278,
    m81: 282, m82: 293, m83: 308, m84: 317, m85: 324, m86: 347, m87: 353, m88: 358, m89: 364, m90: 375,
    m91: 383, m92: 396, m93: 401, m94: 412, m95: 422, m96: 436, m97: 445, m98: 454, m99: 462, m100: 473,
    //mn3
    m101: 1, m102: 21, m103: 34, m104: 41, m105: 55, m106: 66, m107: 74, m108: 79, m109: 85, m110: 91,
    m111: 93, m112: 98, m113: 105, m114: 109, m115: 124, m116: 133, m117: 136, m118: 144, m119: 153, m120: 160,
    m121: 176, m122: 185, m123: 197, m124: 209, m125: 213, m126: 223, m127: 229, m128: 236, m129: 246, m130: 261,
    m131: 272, m132: 276, m133: 279, m134: 286, m135: 289, m136: 298, m137: 304, m138: 313, m139: 323, m140: 342,
    m141: 371, m142: 376, m143: 383, m144: 389, m145: 395, m146: 398, m147: 416, m148: 420, m149: 428, m150: 434, m151: 438, m152: 453,
    //sn1 , 最後一位一定是文字
    s1a: 1, s1b: 11, s1c: 21, s1d: 31, s1e: 41, s1f: 51, s1g: 61, s1h: 71,
    s2a: 82, s2b: 92, s2c: 102, s3a: 112, s3b: 122, s3c: 132, s4a: 137, s4b: 147, s4c: 157, s5a: 162,
    s6a: 172, s6b: 182, s7a: 187, s7b: 197, s8a: 209, s9a: 221, s10a: 235, s11a: 247, s11b: 257, s11c: 267,
    //sn2
    s12a: 1, s12b: 11, s12c: 21, s12d: 31, s12e: 41, s12f: 51, s12g: 61, s12h: 71, s12i: 73,
    s13a: 74, s14a: 85, s14b: 95, s14c: 107, s14d: 114, s15a: 124, s15b: 134, s16a: 144,
    s17a: 157, s17b: 167, s17c: 170, s17d: 180, s18a: 188, s18b: 198, s19a: 202, s19b: 212, s20a: 223, s21a: 235,
    //sn3
    s22a: 1, s22b: 12, s22c: 22, s22d: 33, s22e: 43, s22f: 53, s22g: 63, s22h: 73, s22i: 83, s22j: 93, s22k: 103, s22l: 113, s22m: 126, s22n: 136, s22o: 150,
    s23a: 160, s23b: 170, s23c: 182, s23d: 194, s24a: 206, s24b: 224, s24c: 250, s24d: 276,
    s25a: 302, s26a: 312, s27a: 322, s28a: 332, s29a: 342, s30a: 392, s31a: 438, s32a: 550, s33a: 607, s34a: 662,
    //sn4
    s35a: 1, s35b: 13, s35c: 23, s35d: 33, s35e: 43, s35f: 53, s35g: 63, s35h: 74, s35i: 84, s35j: 94, s35k: 104, s35l: 114, s35m: 124, s35n: 134,
    s35o: 146, s35p: 156, s35q: 168, s35r: 228, s35s: 238,
    s36a: 249, s36b: 259, s36c: 269, s37a: 280, s37b: 294, s37c: 304, s38a: 314, s39a: 330, s40a: 332, s41a: 343, s42a: 353, s43a: 366, s43b: 377, s44a: 410,
    //sn5
    s45a: 1, s45b: 11, s45c: 21, s45d: 31, s45e: 41, s45f: 49, s45g: 63, s45h: 77, s45i: 91, s45j: 103, s45k: 139, s45l: 149, s45m: 161, s45n: 172,
    s46a: 182, s46b: 192, s46c: 202, s46d: 212, s46e: 222, s46f: 232, s46g: 238, s46h: 248, s46i: "258-269", s46j: "270-279", s46k: "280-291",
    s46l: "292-301", s46m: "302-310", s46n: "312-323", s46o: "324-333", s46p: "334-345", s46q: "346-356", s46r: "357-366",
    s47a: 367, s47b: 377, s47c: 387, s47d: 397, s47e: 407, s47f: "417-428", s47g: "429-438", s47h: "439-450", s47i: "451-460", s47j: "461-470",
    s48a: 471, s48b: 481, s48c: 491, s48d: 501, s48e: 511, s48f: 521, s48g: 531, s48h: "541-552", s48i: "587-596", s48j: "597-608", s48k: "641-650",
    s49a: "651-662", s49b: "663-672", s49c: "673-684", s49d: "685-694", s49e: "695-704", // 663-672 missing markup in s0305m appamādavaggo 
    s50a: "705-716", s50b: "717-748", s50c: "749-758", s50d: "759-770", s50e: "792-802", s50f: "803-812", //717-748 , see cs/ro-errata.js:s0305m and sc/msdiv.js:sn5
    s51a: 813, s51b: 823, s51c: 833, s51d: "845-856", s51e: "889-898",
    s52a: 899, s52b: 909,
    s53a: "923-934", s53b: "967-976",
    s54a: 977, s54b: 987,
    s55a: 997, s55b: 1007, s55c: 1017, s55d: 1027, s55e: 1037, s55f: 1047, s55g: 1058,
    s56a: 1071, s56b: 1081, s56c: 1091, s56d: 1101, s56e: 1111, s56f: 1121, s56g: 1131, s56h: 1141, s56i: 1151, s56j: 1161, s56k: 1172,
    a1a: 1, a1b: 11, a1c: 21, a1d: 31, a1e: 41, a1f: 51, a1g: 61, a1h: 71, a1i: 82, a1j: 98, a1k: 140, a1l: 150, a1m: 170, a1n: 188, a1o: 268,
    a1p: 296, a1q: "366-381", a1r: 382, a1s: 563, a1t: 600,
    a2a: 1, a2b: 11, a2c: 22, a2d: 33, a2e: 43, a2f: 53, a2g: 65, a2h: 78, a2i: 88, a2j: 99, a2k: 119, a2l: 131, a2m: 142, a2n: 152, a2o: 164,
    a2p: 181, a2q: "191-200", a2r: 201, a2s: 231,
    a3a: 1, a3b: 11, a3c: 21, a3d: 31, a3e: 41, a3f: 52, a3g: 62, a3h: 72, a3i: 82, a3j: 93, a3k: 104, a3l: 114, a3m: 124, a3n: 134, a3o: 147,
    a3p: "157-163", a3q: "164-183", a3r: 184,
    a4a: 1, a4b: 11, a4c: 21, a4d: 31, a4e: 41, a4f: 51, a4g: 61, a4h: 71, a4i: 81, a4j: 91, a4k: 101, a4l: 111, a4m: 121, a4n: 131, a4o: 141,
    a4p: 151, a4q: 161, a4r: 171, a4s: 181, a4t: 191, a4u: 201, a4v: 211, a4w: 221, a4x: 232, a4y: 243, a4z: 254, a4ba: 264, a4bb: 274,
    a5a: 1, a5b: 11, a5c: 21, a5d: 31, a5e: 41, a5f: 51, a5g: 61, a5h: 71, a5i: 81, a5j: 91, a5k: 101, a5l: 111, a5m: 121, a5n: 131, a5o: 141,
    a5p: 151, a5q: 161, a5r: 171, a5s: 181, a5t: 191, a5u: 201, a5v: 211, a5w: 221, a5x: 231, a5y: 241, a5z: 251, a5ba: 272, a5bb: 286, a5bc: 303,
    a6a: 1, a6b: 11, a6c: 21, a6d: 31, a6e: 43, a6f: 55, a6g: 65, a6h: 75, a6i: 85, a6j: 96, a6k: 107, a6l: 117, a6m: 140,
    a7a: 1, a7b: 11, a7c: 21, a7d: 32, a7e: 44, a7f: 54, a7g: 65, a7h: 75, a7i: 85, a7j: 95, a7k: 623,
    a8a: 1, a8b: 11, a8c: 21, a8d: 31, a8e: 41, a8f: 51, a8g: 61, a8h: 71, a8i: 81, a8j: "91-116", a8k: 117,
    a9a: 1, a9b: 11, a9c: 21, a9d: 32, a9e: 42, a9f: 52, a9g: 63, a9h: 73, a9i: 83, a9j: 93,
    a10a: 1, a10b: 11, a10c: 21, a10d: 31, a10e: 41, a10f: 51, a10g: 61, a10h: 71, a10i: 81, a10j: 91, a10k: 101, a10l: 113, a10m: 123, a10n: 134,
    a10o: 145, a10p: 155, a10q: 167, a10r: 178, a10s: 189, a10t: 199, a10u: 211, a10v: 221, a10w: 237,
    a11a: 1, a11b: 11, a11c: "22-29", a11d: 503
};

var firstParanumOf = function (chunkid) {
    return FirstPN[chunkid];
};
var BKPN_C = null;
var buildReverse = function () {
    BKPN_C = {};
    for (var c in FirstPN) {
        var bk = '';
        var _a = c.match(/([a-z]+)(\d+)/); _a[0]; var pf = _a[1], seg = _a[2];
        var nseg = parseInt(seg);
        var pn = FirstPN[c];
        if (pf === 'd') {
            if (nseg > 0 && nseg <= 13)
                bk = 'dn1';
            else if (nseg >= 14 && nseg <= 23)
                bk = 'dn2';
            else if (nseg >= 24 && nseg <= 34)
                bk = 'dn3';
        }
        else if (pf === 'm') {
            if (nseg > 0 && nseg <= 50)
                bk = 'mn1';
            else if (nseg >= 51 && nseg <= 100)
                bk = 'mn2';
            else if (nseg >= 101 && nseg <= 152)
                bk = 'mn3';
        }
        else if (pf === 's') {
            if (nseg > 0 && nseg <= 11)
                bk = 'sn1';
            else if (nseg >= 12 && nseg <= 21)
                bk = 'sn2';
            else if (nseg >= 22 && nseg <= 34)
                bk = 'sn3';
            else if (nseg >= 35 && nseg <= 44)
                bk = 'sn4';
            else if (nseg >= 45 && nseg <= 56)
                bk = 'sn5';
        }
        else if (pf === 'a') {
            bk = 'an' + seg;
        }
        else if (pf === 'k') {
            bk = 'kn' + seg;
        }
        if (!bk)
            throw "error chunk " + c;
        if (!BKPN_C[bk])
            BKPN_C[bk] = {};
        BKPN_C[bk][pn] = c;
    }
};
var bookParanumToChunk = function (bkid, pn) {
    if (!BKPN_C)
        buildReverse();
    return (BKPN_C[bkid] || {})[pn];
};

//do no import nodefs.ts
var BookPrefix = {
    vin: "pj,pc,mv,cv,pvr",
    dn: "dn1,dn2,dn3",
    mn: "mn1,mn2,mn3",
    sn: "sn1,sn2,sn3,sn4,sn5", //match subfolder 
    an: "an1,an2,an3,an4,an5,an6,an7,an8,an9,an10,an11",
    ab: "ds,dt,kv,pt,pp,vb,ya",
    kn: "kp,snp,dhp,iti,ud,vv"
};
var AB = 'abhidhamma', VIN = 'vinaya';
var booksOf = function (id) {
    var idarr = id.split(',');
    var out = [];
    idarr.forEach(function (id) {
        var s = BookPrefix[id];
        if (typeof s === 'string') {
            out.push.apply(out, s.split(","));
        }
        else {
            out.push(id);
        }
    });
    return out.filter(function (it) { return !!it; });
};
var sortFilenames = function (filenames) {
    return filenames.sort(function (f1, f2) {
        var m2f1 = f1.match(/(\d+)\.(\d+)/);
        var mf1 = f1.match(/(\d+)/);
        var m2f2 = f2.match(/(\d+)\.(\d+)/);
        var mf2 = f2.match(/(\d+)/);
        if (!m2f1 || !m2f2)
            return parseInt(mf1[1]) - parseInt(mf2[1]);
        return m2f1[1] == m2f2[1] ? (parseInt(m2f1[2]) - parseInt(m2f2[2])) :
            (parseInt(m2f1[1]) > parseInt(m2f2[1]) ? 1 : -1);
    });
};
var getFilesOfBook = function (pat, filesFolders, rootfolder) {
    var folders = filesFolders[pat];
    if (!folders)
        return [];
    if (typeof folders === 'string') {
        var out_1 = [];
        folders.split(',').forEach(function (f) {
            if (filesFolders[f])
                out_1.push.apply(out_1, filesFolders[f]);
            else
                out_1.push(f);
        });
        folders = out_1;
    }
    var files = [];
    folders.forEach(function (subfolder) {
        var f = filesFromPattern(subfolder, rootfolder);
        files.push.apply(files, sortFilenames(f));
    });
    return files;
};
var pitakaOf = function (id) {
    var pf = id.replace(/\d+$/, '');
    return { pj: VIN, pc: VIN, mv: VIN, cv: VIN, pvr: VIN, vin: VIN,
        ab: AB, ds: AB, dt: AB, kv: AB, pt: AB, pp: AB, vb: AB, ya: AB }[pf] || 'sutta';
};
var suttaOfBook = function (bkid) {
    var out = [];
    if (bkid === 'dn')
        for (var i = 1; i <= 34; i++)
            out.push('d' + i);
    else if (bkid === 'dn1')
        for (var i = 1; i <= 13; i++)
            out.push('d' + i);
    else if (bkid === 'dn2')
        for (var i = 14; i <= 23; i++)
            out.push('d' + i);
    else if (bkid === 'dn3')
        for (var i = 24; i <= 34; i++)
            out.push('d' + i);
    else if (bkid === 'mn')
        for (var i = 1; i <= 152; i++)
            out.push('m' + i);
    else if (bkid === 'mn1')
        for (var i = 1; i <= 50; i++)
            out.push('m' + i);
    else if (bkid === 'mn2')
        for (var i = 51; i <= 100; i++)
            out.push('m' + i);
    else if (bkid === 'mn3')
        for (var i = 101; i <= 152; i++)
            out.push('m' + i);
    else if (bkid === 'sn')
        for (var i = 1; i <= 56; i++)
            out.push('s' + i);
    else if (bkid === 'sn1')
        for (var i = 1; i <= 11; i++)
            out.push('s' + i);
    else if (bkid === 'sn2')
        for (var i = 12; i <= 21; i++)
            out.push('s' + i);
    else if (bkid === 'sn3')
        for (var i = 22; i <= 34; i++)
            out.push('s' + i);
    else if (bkid === 'sn4')
        for (var i = 35; i <= 44; i++)
            out.push('s' + i);
    else if (bkid === 'sn5')
        for (var i = 45; i <= 56; i++)
            out.push('s' + i);
    else if (bkid === 'an')
        for (var i = 1; i <= 11; i++)
            out.push('a' + i);
    else if (bkid.match(/an\d/))
        out.push('a' + bkid.substr(2));
    return out;
};

var meta_cs = {
    firstParanumOf: firstParanumOf,
    bookParanumToChunk: bookParanumToChunk,
    FirstPN: FirstPN,
    suttaOfBook: suttaOfBook
};

var meta_sc = {
    getFilesOfBook: getFilesOfBook,
    pitakaOf: pitakaOf,
    booksOf: booksOf,
    sortFilenames: sortFilenames,
    suttaOfBook: suttaOfBook
};

var PGDEXT = '.pgd';

var Paged = /** @class */ (function () {
    function Paged() {
        this.pagenames = Array();
        this.pagetexts = Array();
        this.header = {};
        this.log = [];
        this.dirty = 0;
    }
    Object.defineProperty(Paged.prototype, "lastpage", {
        get: function () { return this.pagetexts.length - 1; },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Paged.prototype, "filehandle", {
        get: function () { return this.handle; },
        enumerable: false,
        configurable: true
    });
    Paged.prototype.loadFromHandle = function (h, _name) {
        return __awaiter(this, void 0, void 0, function () {
            var workingfile, str;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, h.getFile()];
                    case 1:
                        workingfile = _a.sent();
                        return [4 /*yield*/, workingfile.text()];
                    case 2:
                        str = _a.sent();
                        this.handle = h;
                        this.name = _name;
                        return [2 /*return*/, this.loadFromString(str, _name)];
                }
            });
        });
    };
    Paged.prototype.setHandle = function (h) {
        this.handle = h;
    };
    Paged.prototype.loadFromUrl = function (url, _name) {
        return __awaiter(this, void 0, void 0, function () {
            var text;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!~url.indexOf('http') && ~url.indexOf('/'))
                            url = 'https://' + url;
                        else if (url.indexOf(PGDEXT) == -1)
                            url += PGDEXT;
                        url = url.replace('/jsbin/', '/output.jsbin.com/');
                        return [4 /*yield*/, loadUrl(url)];
                    case 1:
                        text = _a.sent();
                        if (!_name)
                            _name = (url.match(/([A-Za-z\-_]+)\.pgd/) || ['', 'noname'])[1];
                        return [2 /*return*/, this.loadFromString(text, _name)];
                }
            });
        });
    };
    Paged.prototype.loadFromString = function (str, _name) {
        var keys = {};
        var lines = str.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var at = lines[i].indexOf('\t');
            if (~at) { //page breaker
                var key = line.slice(0, at);
                if (!keys[key])
                    keys[key] = true;
                else if (key) {
                    this.log.push(_name + ' dup key:' + key);
                }
                this.pagenames.push(key);
                this.pagetexts.push(line.slice(at + 1));
            }
            else { //normal line
                if (!this.pagetexts.length) {
                    this.pagetexts.push(line);
                    this.pagenames.push('');
                }
                else
                    this.pagetexts[this.pagetexts.length - 1] += '\n' + line;
            }
        }
        if (this.pagetexts.length < 2) {
            this.pagetexts.push('blank page');
        }
        this.header = this.parseHeader(this.pagetexts[0]);
        this.name = _name;
        return this;
    };
    Paged.prototype.parseHeader = function (text) {
        var out = {};
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var ch = line.charAt(0);
            if (ch === '#')
                continue;
            if (ch === '{') {
                var objstr = extractObject(line)[0];
                try {
                    var obj = jsonify(objstr);
                    for (var key in obj) {
                        out[key] = obj[key];
                    }
                }
                catch (_a) {
                    this.log.push("header error " + line);
                }
            }
        }
        return out;
    };
    Paged.prototype.listEntries = function (tofind, max) {
        if (max === void 0) { max = 100; }
        var regex = new RegExp(tofind);
        var out = Array();
        var N = this.pagenames;
        for (var i = 1; i < N.length; i++) {
            if (N[i].match(regex)) {
                if (out.length >= max)
                    break;
                out.push(i);
            }
        }
        return out;
    };
    Paged.prototype.scanEntries = function (tofind, max) {
        if (max === void 0) { max = 100; }
        var regex = new RegExp(tofind);
        var out = Array();
        var N = this.pagenames;
        var T = this.pagetexts;
        for (var i = 1; i < N.length; i++) {
            if (!N[i])
                continue;
            if (T[i].match(regex)) {
                if (out.length >= max)
                    break;
                out.push(i);
            }
        }
        return out;
    };
    Paged.prototype.dumpOffTsv = function (name) {
        if (name === void 0) { name = ''; }
        name = name || this.name;
        var offtext = Array();
        var tsv = Array();
        for (var i = 0; i <= this.pagetexts.length - 1; i++) {
            var t = this.pagetexts[i];
            offtext.push('^dk' + (i) + ' ' + t); //decode in pagedGroupFromPtk, chunk without name
            if (this.pagenames[i])
                tsv.push(this.pagenames[i] + '\t' + i);
        }
        if (tsv.length) { //overwrite PtkFromPagedGroup default tsv header
            tsv.unshift("^:<name=" + name + ">\tdkat=number");
            //dkat might have gap as some pages are nameless
        }
        var title = '';
        var H = Object.assign({}, this.header);
        if (!H.id)
            H.id = name;
        if (H.title) {
            title = ('《' + H.title + '》');
            delete H.title; //shouldn't delete header.title
        }
        var bkattrs = JSON.stringify(H);
        var prolog = '^ak#' + H.id + '^bk' + bkattrs + title + '\n';
        return [prolog + offtext.join('\n'), tsv.join('\n')];
    };
    Paged.prototype.dump = function (escape) {
        if (escape === void 0) { escape = false; }
        var out = [this.pagetexts[0]];
        for (var i = 1; i <= this.pagetexts.length - 1; i++) {
            var t = this.pagetexts[i];
            out.push(this.pagenames[i] + '\t' + (escape ? escapeTemplateString(t) : t));
        }
        return out.join('\n');
    };
    Paged.prototype.insertPage = function (thispage, newcontent) {
        if (newcontent === void 0) { newcontent = ''; }
        if (!thispage)
            return 0;
        this.pagetexts.splice(thispage, 0, newcontent);
        this.pagenames.splice(thispage, 0, '');
        return thispage + 1;
    };
    Paged.prototype.deletePage = function (thispage) {
        if (!thispage)
            return this;
        this.pagetexts.splice(thispage, 1);
        this.pagenames.splice(thispage, 1);
        return this;
    };
    Paged.prototype.browserSave = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var out, handle, writable;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        out = this.dump();
                        handle = this.handle;
                        if (!!handle) return [3 /*break*/, 2];
                        return [4 /*yield*/, window.showSaveFilePicker(opts)];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!handle)
                            return [2 /*return*/];
                        return [4 /*yield*/, verifyPermission(handle, true)];
                    case 3:
                        if (!_a.sent()) return [3 /*break*/, 7];
                        return [4 /*yield*/, handle.createWritable()];
                    case 4:
                        writable = _a.sent();
                        return [4 /*yield*/, writable.write(out)];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, writable.close()];
                    case 6:
                        _a.sent();
                        this.clearDirty();
                        this.handle = handle;
                        return [2 /*return*/, handle];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    Paged.prototype.pageText = function (n) {
        if (typeof n == 'string' && parseInt(n).toString() !== n) {
            n = this.pagenames.indexOf(n);
        }
        return this.pagetexts[n];
    };
    Paged.prototype.pageName = function (n) {
        return this.pagenames[n];
    };
    Paged.prototype.setPageName = function (pagename, n) {
        this.pagenames[n] = pagename;
    };
    Paged.prototype.findPageName = function (pagename) {
        return this.pagenames.indexOf(pagename);
    };
    Paged.prototype.setPageText = function (n, value) {
        var m = -1;
        if (typeof n == 'number')
            m = n;
        if (typeof n == 'string' && parseInt(n).toString() !== n) {
            m = this.pagenames.indexOf(n);
        }
        if (!~m)
            return;
        if (m == 0) {
            this.header = this.parseHeader(value);
        }
        else if (m >= 0 && m < this.pagetexts.length) {
            this.pagetexts[m] = value;
        }
    };
    Paged.prototype.clearDirty = function () {
        this.dirty = 0;
    };
    Paged.prototype.markDirty = function () {
        this.dirty++;
    };
    return Paged;
}());

var PagedGroup = /** @class */ (function () {
    function PagedGroup() {
        var _this = this;
        this._keeped = {}; // name of keepText
        this.alignable = function (name) {
            var out = Array();
            var paged = _this._pageds[name];
            if (!paged)
                return [];
            for (var key in _this._pageds) {
                if (key == name)
                    continue;
                if (_this._pageds[key].lastpage == paged.lastpage
                //  || name.replace(/_[a-z][a-z]$/,'')==key.replace(/_[a-z][a-z]+$/,'') //same prefix, assume langauge code 2 chars
                ) {
                    out.push(key);
                }
            }
            return out;
        };
        this.reset();
    }
    PagedGroup.prototype.reset = function () {
        this._pageds = {};
        this.backlinks = {};
        this._keeped = {};
    };
    PagedGroup.prototype.add = function (name, content) {
        var paged = new Paged();
        paged.loadFromString(content, name);
        this._pageds[name] = paged;
        return paged;
    };
    PagedGroup.prototype.addHandle = function (name, handle) {
        return __awaiter(this, void 0, void 0, function () {
            var paged;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        paged = new Paged();
                        return [4 /*yield*/, paged.loadFromHandle(handle, name)];
                    case 1:
                        _a.sent();
                        this._pageds[name] = paged;
                        return [2 /*return*/, paged];
                }
            });
        });
    };
    PagedGroup.prototype.addUrl = function (name, url) {
        return __awaiter(this, void 0, void 0, function () {
            var paged;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        paged = new Paged();
                        return [4 /*yield*/, paged.loadFromUrl(url, name)];
                    case 1:
                        _a.sent();
                        this._pageds[name] = paged;
                        return [2 /*return*/, paged];
                }
            });
        });
    };
    Object.defineProperty(PagedGroup.prototype, "names", {
        get: function () {
            return Object.keys(this._pageds);
        },
        enumerable: false,
        configurable: true
    });
    PagedGroup.prototype.markKeeped = function (name) {
        this._keeped[name] = true;
    };
    PagedGroup.prototype.clearKeeped = function (name) {
        this._keeped[name] = false;
    };
    PagedGroup.prototype.clearDirty = function (name) {
        if (this._pageds[name])
            this._pageds[name].clearDirty();
    };
    PagedGroup.prototype.markDirty = function (name) {
        if (this._pageds[name])
            this._pageds[name].markDirty();
    };
    PagedGroup.prototype.getDirty = function (name) {
        var _a;
        return ((_a = this._pageds[name]) === null || _a === void 0 ? void 0 : _a.dirty) || 0;
    };
    PagedGroup.prototype.keepCount = function () {
        return this.keeped;
    };
    PagedGroup.prototype.getKeeped = function (name) {
        return this._keeped[name];
    };
    PagedGroup.prototype.getItem = function (name) {
        return this._pageds[name];
    };
    PagedGroup.prototype.remove = function (name) {
        delete this._pageds[name];
    };
    PagedGroup.prototype.exists = function (key) {
        return !!this._pageds[key];
    };
    Object.defineProperty(PagedGroup.prototype, "first", {
        get: function () {
            return this.names.length ? this.names[0] : '';
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PagedGroup.prototype, "keeped", {
        get: function () {
            var keeped = 0;
            for (var name_1 in this._keeped) {
                if (this._keeped[name_1])
                    keeped++;
            }
            return keeped;
        },
        enumerable: false,
        configurable: true
    });
    return PagedGroup;
}());

var getRels = function (children, ctx) {
    var out = {};
    for (var i = 0; i < children.length; i++) {
        var attrs = children[i].attrs;
        if (!attrs)
            continue;
        var target = (attrs['Target'] || '')
            .replace('.docx', '')
            .replace('../law/', '')
            .replace('../law1/', '')
            .replace('../law2/', '')
            .replace('../law3/', '');
        if (ctx.idmap[target])
            target = ctx.idmap[target];
        if (target)
            out[attrs['Id']] = target;
    }
    return out;
};

var dumprun = function (wr) {
    var out = '';
    for (var i = 0; i < wr.children.length; i++) {
        var item = wr.children[i];
        if (item.name == 'w:t') {
            out += item.children[0] || '';
            if (item.attrs['@_xml:space'] == 'preserve') {
                out += '　';
            }
        }
        else if (item.name == 'w:rPr') ;
    }
    return out;
};
var dumppara = function (para, ctx) {
    var _a;
    var out = '';
    if (!para)
        return;
    var openpara = ctx.openhandlers['w:p'];
    var closepara = ctx.openhandlers['w:p'];
    out += openpara ? openpara(para.attrs) : '';
    for (var i = 0; i < para.children.length; i++) {
        var child = para.children[i];
        var attrs = child.attrs || {};
        var open_1 = ctx.openhandlers[child.name];
        var close_1 = ctx.closehandlers[child.name];
        if (child.name == 'w:r') {
            out += dumprun(child);
        }
        else if (child.name == 'w:hyperlink') {
            var arr = child.children;
            //憲法 第22條（基本人權保障）相關解釋 nested hyperlink
            out += open_1(attrs);
            var h = '';
            if (((_a = arr[0]) === null || _a === void 0 ? void 0 : _a.name) == 'w:hyperlink') {
                for (var j = 0; j < arr[0].children.length; j++) {
                    h += dumprun(arr[0].children[j]);
                }
            }
            for (var j = 0; j < arr.length; j++) {
                if (arr[j].name == 'w:r')
                    h += dumprun(arr[j]);
            }
            out += h;
            out += close_1(attrs);
        }
        else if (child.name == 'w:pPr') {
            for (var i_1 = 0; i_1 < child.children.length; i_1++) {
                var node = child.children[i_1];
                if (node.name == 'w:pStyle' && node.attrs['w:val']) {
                    out += ctx.openhandlers['w:pStyle'](node.attrs);
                }
            }
        }
        else if (child.name == 'w:bookmarkStart') {
            out += open_1(attrs);
        }
    }
    out += closepara ? closepara(para.attrs) : '';
    out = ctx.onPara ? ctx.onPara(ctx, out) : '';
    return out;
};

var processDocument = function (data, ctx) {
    var dom = DOMFromString(data);
    var out = [];
    var body = xpath(dom, 'w:body');
    if (!body) {
        console.log('no body', ctx.fn);
        return;
    }
    for (var i = 0; i < body.children.length; i++) {
        if (body.children[i].name == 'w:p') {
            var para = dumppara(body.children[i], ctx);
            if (para) {
                out.push(para);
            }
        }
    }
    return out;
};
var processRels = function (data, ctx) {
    var dom = DOMFromString(data);
    return getRels(dom.children, ctx);
};

var docx2offtext = function (ctx, fn) { return __awaiter(void 0, void 0, void 0, function () {
    var ifn, buffer, zip, filename, _a, _b, out, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                ifn = ctx.cwd + path.sep + fn;
                if (!fs.existsSync(ifn)) {
                    console.log('file not found', ifn);
                    return [2 /*return*/];
                }
                buffer = fs.readFileSync(ifn);
                ctx.fn = fn;
                return [4 /*yield*/, ctx.readZipBuffer(buffer)];
            case 1:
                zip = _d.sent();
                filename = fn.replace('.docx', '');
                ctx.onDocStart && ctx.onDocStart(ctx, filename);
                _a = ctx;
                _b = processRels;
                return [4 /*yield*/, zip.file('word/_rels/document.xml.rels').async('string')];
            case 2:
                _a.rels = _b.apply(void 0, [_d.sent(), ctx]);
                _c = processDocument;
                return [4 /*yield*/, zip.file('word/document.xml').async('string')];
            case 3:
                out = _c.apply(void 0, [_d.sent(), ctx]);
                if (!ctx.output)
                    ctx.output = {};
                ctx.output[filename] = out;
                ctx.currentoutput = out;
                return [2 /*return*/];
        }
    });
}); };
var processDocuments = function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var t, _a, _b, _c, item, e_1_1;
    var _d, e_1, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                t = new Date();
                _g.label = 1;
            case 1:
                _g.trys.push([1, 8, 9, 14]);
                _a = true, _b = __asyncValues(ctx.lst);
                _g.label = 2;
            case 2: return [4 /*yield*/, _b.next()];
            case 3:
                if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 7];
                _f = _c.value;
                _a = false;
                item = _f;
                if (!item)
                    return [3 /*break*/, 7];
                if (ctx.verbose)
                    process.stdout.write('\r ' + item + '                        ');
                if (!item.startsWith('cd ')) return [3 /*break*/, 4];
                ctx.cwd = item.slice(3);
                return [3 /*break*/, 6];
            case 4: return [4 /*yield*/, docx2offtext(ctx, item)];
            case 5:
                _g.sent();
                ctx.onDocEnd && ctx.onDocEnd(ctx, item);
                _g.label = 6;
            case 6:
                _a = true;
                return [3 /*break*/, 2];
            case 7: return [3 /*break*/, 14];
            case 8:
                e_1_1 = _g.sent();
                e_1 = { error: e_1_1 };
                return [3 /*break*/, 14];
            case 9:
                _g.trys.push([9, , 12, 13]);
                if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 11];
                return [4 /*yield*/, _e.call(_b)];
            case 10:
                _g.sent();
                _g.label = 11;
            case 11: return [3 /*break*/, 13];
            case 12:
                if (e_1) throw e_1.error;
                return [7 /*endfinally*/];
            case 13: return [7 /*endfinally*/];
            case 14:
                console.log('time elapsed', new Date() - t);
                return [2 /*return*/];
        }
    });
}); };

var ctx$1 = {
    rels: {},
    ext: 'off',
    fn: '',
    openhandlers: {
        'w:hyperlink': function (attrs) {
            var anchor = attrs['w:anchor'];
            var id = attrs['r:id'] || '';
            //convert hyperlink id to slink internal id(allnames)
            var linktarget = (id && !isNaN(parseInt(ctx$1.rels[id]))) ? ctx$1.rels[id] : id;
            return '^a{' + (linktarget ? 'ln:"' + linktarget + '",' : '') + (anchor ? 'id:"' + anchor.replace(/^a/, '') : '') + '"}[';
        },
        'w:pStyle': function (attrs) { return (attrs['w:val'] ? '^h' + attrs['w:val'] : '') + ' '; },
        'w:bookmarkStart': function (attrs) { return '^bm{id:"' + attrs['w:name'] + '"}'; }
    },
    closehandlers: {
        'w:hyperlink': function () { return ']'; }
    }
};

var ctx = {
    rels: {},
    ext: 'md',
    fn: '',
    openhandlers: {
        'w:hyperlink': function (attrs) {
            var anchor = attrs['w:anchor'];
            var id = attrs['r:id'] || '';
            //convert hyperlink id to slink internal id(allnames)
            var linktarget = (id && !isNaN(parseInt(ctx.rels[id]))) ? '@' + ctx.rels[id] : id;
            ctx.link = linktarget + (anchor ? '#^' + anchor : '');
            return '[[' + ctx.link + '|';
        },
        'w:pStyle': function (attrs) {
            var heading = parseInt(attrs['w:val']) || 0;
            return '#'.repeat(heading) + ' ';
        },
        'w:bookmarkStart': function (attrs) { return '<a name="' + attrs['w:name'] + '">'; },
        'w:p': function (attrs) { return '\n'; }
    },
    closehandlers: {
        'w:hyperlink': function () { return ']]'; }
    }
};

var contexts = { offtextcontext: ctx$1, markdowncontext: ctx };
var contextByFormat = function (f) { return contexts[f + 'context']; };

exports.ACTIONPAGESIZE = ACTIONPAGESIZE;
exports.ALWAYS_EMPTY = ALWAYS_EMPTY;
exports.AUTO_TILL_END = AUTO_TILL_END;
exports.Action = Action;
exports.BRANCH_SEP = BRANCH_SEP;
exports.BYTE1_MAX = BYTE1_MAX;
exports.BYTE2_MAX = BYTE2_MAX;
exports.BYTE2_START = BYTE2_START;
exports.BYTE3_MAX = BYTE3_MAX;
exports.BYTE3_START = BYTE3_START;
exports.BYTE4_MAX = BYTE4_MAX;
exports.BYTE4_START = BYTE4_START;
exports.BYTE5_MAX = BYTE5_MAX;
exports.BYTE5_START = BYTE5_START;
exports.BYTE_MAX = BYTE_MAX;
exports.CJKRangeName = CJKRangeName;
exports.CJKRanges = CJKRanges;
exports.CJKWordBegin_Reg = CJKWordBegin_Reg;
exports.CJKWordEnd_Reg = CJKWordEnd_Reg;
exports.CJKWord_Reg = CJKWord_Reg;
exports.COLUMNFIELDSEP = COLUMNFIELDSEP;
exports.CodeStart = CodeStart$2;
exports.Column = Column;
exports.CompiledFile = CompiledFile;
exports.Compiler = Compiler;
exports.DOMFromString = DOMFromString;
exports.DeNormLexeme = DeNormLexeme;
exports.EXCERPTACTIONPREFIX = EXCERPTACTIONPREFIX;
exports.EXCERPT_PAGESIZE = EXCERPT_PAGESIZE;
exports.Element = Element;
exports.FROMTILL = FROMTILL;
exports.FolioText = FolioText;
exports.Formula = Formula;
exports.GUIDEACTIONPREFIX = GUIDEACTIONPREFIX;
exports.HTMLTAG_REGEX_G = HTMLTAG_REGEX_G;
exports.Indexer = Indexer;
exports.Inverted = Inverted;
exports.JSONParse = JSONParse;
exports.JSONify = JSONify;
exports.LEMMA_DELIMITER = LEMMA_DELIMITER;
exports.LEXEME_REG_G = LEXEME_REG_G;
exports.LEX_REG_G = LEX_REG_G;
exports.LVA = LVA$1;
exports.LineBase = LineBase;
exports.LineBaser = LineBaser;
exports.MAXDIVISIONLINE = MAXDIVISIONLINE;
exports.MAXFOLIOCHAR = MAXFOLIOCHAR;
exports.MAXFOLIOLINE = MAXFOLIOLINE;
exports.MAXPHRASELEN = MAXPHRASELEN;
exports.MAX_PHRASE = MAX_PHRASE;
exports.MAX_VERROR = MAX_VERROR;
exports.MIN_ABRIDGE = MIN_ABRIDGE;
exports.NormLexeme = NormLexeme;
exports.OFFTAG_ATTRS = OFFTAG_ATTRS;
exports.OFFTAG_COMPACT_ATTR = OFFTAG_COMPACT_ATTR;
exports.OFFTAG_COMPACT_ID = OFFTAG_COMPACT_ID;
exports.OFFTAG_LEADBYTE = OFFTAG_LEADBYTE;
exports.OFFTAG_NAME_ATTR = OFFTAG_NAME_ATTR;
exports.OFFTAG_REGEX = OFFTAG_REGEX$1;
exports.OFFTAG_REGEX_G = OFFTAG_REGEX_G;
exports.OFFTAG_REGEX_SPLIT = OFFTAG_REGEX_SPLIT;
exports.OFFTAG_REGEX_TOKENIZE = OFFTAG_REGEX_TOKENIZE;
exports.OWNERDRAWPREFIX = OWNERDRAWPREFIX;
exports.Offtext = Offtext;
exports.PALIWORD_REG_G = PALIWORD_REG_G;
exports.PGDEXT = PGDEXT;
exports.PTK_ACTION_FROMTILL = PTK_ACTION_FROMTILL;
exports.PTK_FROMTILL = PTK_FROMTILL;
exports.Paged = Paged;
exports.PagedGroup = PagedGroup;
exports.Pitaka = Pitaka;
exports.PtkFromPagedGroup = PtkFromPagedGroup;
exports.QSTRING_REGEX_G = QSTRING_REGEX_G;
exports.QUOTEPAT = QUOTEPAT;
exports.QUOTEPREFIX = QUOTEPREFIX;
exports.REGEX_CJK_PHRASE = REGEX_CJK_PHRASE;
exports.REGEX_IRE = REGEX_IRE;
exports.REG_PALI_SPACE_SPLIT = REG_PALI_SPACE_SPLIT;
exports.RO_CHARS = RO_CHARS;
exports.RemainingErrata = RemainingErrata;
exports.RemoteZipStore = RemoteZipStore;
exports.RenderUnit = RenderUnit;
exports.SA_MATCH_ANY = SA_MATCH_ANY$1;
exports.SA_MATCH_END = SA_MATCH_END$1;
exports.SA_MATCH_MIDDLE = SA_MATCH_MIDDLE$1;
exports.SA_MATCH_START = SA_MATCH_START$1;
exports.SEP2DITEM = SEP2DITEM;
exports.SEPARATOR2D = SEPARATOR2D;
exports.Sax = Sax;
exports.StringArray = StringArray;
exports.StringByteLength = StringByteLength;
exports.TITLECOUNTACTIONPREFIX = TITLECOUNTACTIONPREFIX;
exports.TOFIND_MAXLEN = TOFIND_MAXLEN;
exports.TOKENIZE_REGEX = TOKENIZE_REGEX;
exports.TableOfContent = TableOfContent;
exports.TaishoJuanFromPage = TaishoJuanFromPage;
exports.TaishoPageFromJuan = TaishoPageFromJuan;
exports.TaishoSutraCode = TaishoSutraCode;
exports.TaishoVolSutra = TaishoVolSutra;
exports.Token = Token;
exports.Trie = Trie;
exports.URL_REGEX = URL_REGEX;
exports.UnicodeBlock = UnicodeBlock;
exports.VALIDPUNCS = VALIDPUNCS;
exports.Word_tailspace_Reg = Word_tailspace_Reg;
exports.ZipStore = ZipStore;
exports.abridgeRenderUnits = abridgeRenderUnits;
exports.addressFromUrl = addressFromUrl;
exports.addtag_x = addtag_x;
exports.addtag_y = addtag_y;
exports.afterPN = afterPN;
exports.alignParagraph = alignParagraph;
exports.alignParagraphLinecount = alignParagraphLinecount;
exports.alignable = alignable;
exports.alphabetically = alphabetically;
exports.alphabetically0 = alphabetically0;
exports.alphabetically1 = alphabetically1;
exports.alphabetically2 = alphabetically2;
exports.arrDelta = arrDelta;
exports.arraydiff = arraydiff;
exports.autoAlign = autoAlign;
exports.autoBreak = autoBreak;
exports.autoChineseBreak = autoChineseBreak;
exports.autoENBreak = autoENBreak;
exports.autoEnglishBreak = autoEnglishBreak;
exports.autoSanskritBreak = autoSanskritBreak;
exports.beforePN = beforePN;
exports.breakByPin = breakByPin;
exports.breakChineseSentence = breakChineseSentence;
exports.breakIASTSyllable = breakIASTSyllable;
exports.breakLine = breakLine;
exports.breakSentence = breakSentence;
exports.brokenTransclusions = brokenTransclusions;
exports.bsearch = bsearch;
exports.bsearchGetter = bsearchGetter;
exports.bsearchNumber = bsearchNumber;
exports.buildTocTag = buildTocTag;
exports.buildYToc = buildYToc;
exports.caesura = caesura;
exports.calApprox = calApprox;
exports.calOriginalOffset = calOriginalOffset;
exports.captionOf = captionOf;
exports.captionOfPage = captionOfPage;
exports.chineseDigit = chineseDigit;
exports.cjkPhrases = cjkPhrases;
exports.cjkSplitPuncs = cjkSplitPuncs;
exports.closeBracketOf = closeBracketOf;
exports.codePointLength = codePointLength;
exports.columnTextByKey = columnTextByKey;
exports.combineHeaders = combineHeaders;
exports.compoundSimilarity = compoundSimilarity;
exports.contextByFormat = contextByFormat;
exports.convertIASTSyllable = convertIASTSyllable;
exports.countFolioChar = countFolioChar;
exports.countMembers = countMembers;
exports.createAction = createAction;
exports.createBrowserDownload = createBrowserDownload;
exports.createField = createField;
exports.createNestingAction = createNestingAction;
exports.cssSkeleton = cssSkeleton;
exports.debounce = debounce;
exports.dedup = dedup;
exports.deepReadDir = deepReadDir;
exports.depthOfId = depthOfId;
exports.deva2IAST = deva2IAST;
exports.diffParanum = diffParanum;
exports.dumppara = dumppara;
exports.dumprun = dumprun;
exports.eatbracket = eatbracket;
exports.eatofftag = eatofftag;
exports.enableAccelon23Features = enableAccelon23Features;
exports.enableFeature = enableFeature;
exports.enableFeatures = enableFeatures;
exports.enableFootnoteFeature = enableFootnoteFeature;
exports.ensureArrayLength = ensureArrayLength;
exports.ensureChunkHasPN = ensureChunkHasPN;
exports.ensurefirstLineHasPN = ensurefirstLineHasPN;
exports.entity2unicode = entity2unicode;
exports.entriesOfKey = entriesOfKey;
exports.enumBases = enumBases;
exports.enumCJKRangeNames = enumCJKRangeNames;
exports.enumEntries = enumEntries;
exports.errorMessage = errorMessage;
exports.escapeHTML = escapeHTML;
exports.escapePackedStr = escapePackedStr;
exports.escapeStrWithQuote = escapeStrWithQuote;
exports.escapeTemplateString = escapeTemplateString;
exports.extractAuthor = extractAuthor;
exports.extractBook = extractBook;
exports.extractChineseNumber = extractChineseNumber;
exports.extractIDS = extractIDS;
exports.extractJSON = extractJSON;
exports.extractObject = extractObject;
exports.extractPuncPos = extractPuncPos;
exports.factorizeText = factorizeText;
exports.fetchAddress = fetchAddress;
exports.fetchAddressExtra = fetchAddressExtra;
exports.fetchFile = fetchFile;
exports.fetchTag = fetchTag;
exports.filesFromPattern = filesFromPattern;
exports.fillGap = fillGap;
exports.findClosestTag = findClosestTag;
exports.folioPosFromAddress = folioPosFromAddress;
exports.forEachUTF32 = forEachUTF32;
exports.foreignNumber = foreignNumber;
exports.formulate = formulate;
exports.fromBase26 = fromBase26;
exports.fromCBETA = fromCBETA;
exports.fromChineseNumber = fromChineseNumber;
exports.fromIAST = fromIAST;
exports.fromIASTOffText = fromIASTOffText;
exports.fromObj = fromObj;
exports.fromSim = fromSim;
exports.getAnyColumnText = getAnyColumnText;
exports.getBookColumnText = getBookColumnText;
exports.getCJKRange = getCJKRange;
exports.getColumnText = getColumnText;
exports.getCounter = getCounter;
exports.getFactors = getFactors;
exports.getInserts = getInserts;
exports.getOfftextLineClass = getOfftextLineClass;
exports.getOrthograph = getOrthograph;
exports.getParallelLines = getParallelLines;
exports.getPostings = getPostings;
exports.getRels = getRels;
exports.getRenderUnitClasses = getRenderUnitClasses;
exports.getSliceText = getSliceText;
exports.getSpeed = getSpeed;
exports.getSutraInfo = getSutraInfo;
exports.getTagById = getTagById;
exports.getTagFields = getTagFields;
exports.getWordInfo = getWordInfo;
exports.gini = gini;
exports.glob = glob;
exports.groupArr = groupArr;
exports.groupNumArray = groupNumArray;
exports.guessEntry = guessEntry;
exports.guidedBreakLines = guidedBreakLines;
exports.hasLang = hasLang;
exports.headerWithNumber = headerWithNumber;
exports.hitsOfLine = hitsOfLine;
exports.hookFromParaLines = hookFromParaLines;
exports.humanBytes = humanBytes;
exports.inMemory = inMemory;
exports.incObj = incObj;
exports.indexOfs = indexOfs;
exports.innertext = innertext;
exports.insertBuf = insertBuf;
exports.insertText = insertText;
exports.intersect = intersect;
exports.intersects = intersects;
exports.isCJKChar = isCJKChar;
exports.isChineseChapter = isChineseChapter;
exports.isChineseNumber = isChineseNumber;
exports.isLex = isLex;
exports.isPunc = isPunc;
exports.isRomanized = isRomanized;
exports.isSurrogate = isSurrogate;
exports.isWordChar = isWordChar;
exports.jsonify = jsonify;
exports.keyOfEntry = keyOfEntry;
exports.langSplitChar = langSplitChar;
exports.length_alphabetically = length_alphabetically;
exports.length_alphabetically0 = length_alphabetically0;
exports.length_alphabetically1 = length_alphabetically1;
exports.lexemeOf = lexemeOf;
exports.lexiconIntersect = lexiconIntersect;
exports.lexiconUnion = lexiconUnion;
exports.lexiconXor = lexiconXor;
exports.lexify = lexify;
exports.lineBreaksOffset = lineBreaksOffset;
exports.linePN = linePN;
exports.listExcerpts = listExcerpts;
exports.listwords = listwords;
exports.loadPostings = loadPostings;
exports.loadPostingsSync = loadPostingsSync;
exports.loadScript = loadScript;
exports.loadUrl = loadUrl;
exports.lookupKeyColumn = lookupKeyColumn;
exports.makeAddress = makeAddress;
exports.makeChunkAddress = makeChunkAddress;
exports.makeElementId = makeElementId;
exports.makeExcerptAddress = makeExcerptAddress;
exports.makeHook = makeHook;
exports.makeInMemoryPtk = makeInMemoryPtk;
exports.makeLineBaser = makeLineBaser;
exports.makePitakaZip = makePitakaZip;
exports.maxlen1 = maxlen1;
exports.maxlen2 = maxlen2;
exports.maxlen3 = maxlen3;
exports.meta_cbeta = meta_cbeta;
exports.meta_cs = meta_cs;
exports.meta_sc = meta_sc;
exports.moveFootnoteToTail = moveFootnoteToTail;
exports.nearestTag = nearestTag;
exports.nextColumn = nextColumn;
exports.nodefs = nodefs;
exports.normalizeQianziwen = normalizeQianziwen;
exports.offTagType = offTagType;
exports.offtext2indic = offtext2indic;
exports.onClose = onClose;
exports.onOfftext = onOfftext;
exports.onOpen = onOpen;
exports.onTextWithInserts = onTextWithInserts;
exports.openComOption = openComOption;
exports.openInMemoryPtk = openInMemoryPtk;
exports.openPtk = openPtk;
exports.openPtkOption = openPtkOption;
exports.openSourceOption = openSourceOption;
exports.orthOf = orthOf;
exports.pack1 = pack1;
exports.pack2 = pack2;
exports.pack3 = pack3;
exports.pack3_2d = pack3_2d;
exports.packBoolean = packBoolean;
exports.packInt = packInt;
exports.packInt2d = packInt2d;
exports.packIntDelta = packIntDelta;
exports.packIntDelta2d = packIntDelta2d;
exports.packOfftagAttrs = packOfftagAttrs;
exports.packStrings = packStrings;
exports.pageBookLineOfAnchor = pageBookLineOfAnchor;
exports.pageFromPtk = pageFromPtk;
exports.pagejsonpfn = pagejsonpfn;
exports.paragraphSimilarity = paragraphSimilarity;
exports.parallelWithDiff = parallelWithDiff;
exports.parseAction = parseAction;
exports.parseAddress = parseAddress;
exports.parseAttributes = parseAttributes;
exports.parseCriteria = parseCriteria;
exports.parseFormula = parseFormula;
exports.parseHook = parseHook;
exports.parseJsonp = parseJsonp;
exports.parseOfftag = parseOfftag;
exports.parseOfftext = parseOfftext;
exports.parsePageBookLine = parsePageBookLine;
exports.parseQianziwen = parseQianziwen;
exports.parseQuery = parseQuery;
exports.parseTransclusion = parseTransclusion;
exports.parseXMLAttribute = parseXMLAttribute;
exports.patchBuf = patchBuf;
exports.peelXML = peelXML;
exports.phraseQuery = phraseQuery;
exports.phraseQuerySync = phraseQuerySync;
exports.pinNotes = pinNotes;
exports.pinPos = pinPos;
exports.plAnd = plAnd;
exports.plContain = plContain;
exports.plCount = plCount;
exports.plFind = plFind;
exports.plRanges = plRanges;
exports.plTrim = plTrim;
exports.poolAdd = poolAdd;
exports.poolDel = poolDel;
exports.poolGet = poolGet;
exports.poolGetAll = poolGetAll;
exports.poolHas = poolHas;
exports.poolParallelPitakas = poolParallelPitakas;
exports.posBackwardPin = posBackwardPin;
exports.posPin = posPin;
exports.predefines = predefines;
exports.processDocument = processDocument;
exports.processDocuments = processDocuments;
exports.processRels = processRels;
exports.providently = providently;
exports.providently0 = providently0;
exports.providently1 = providently1;
exports.ptkFromString = ptkFromString;
exports.ptk_version = ptk_version;
exports.qianziwen = qianziwen;
exports.queryTagFields = queryTagFields;
exports.rangeOfAddress = rangeOfAddress;
exports.rangeOfElementId = rangeOfElementId;
exports.readTextContent = readTextContent;
exports.readTextLines = readTextLines;
exports.regPtkName = regPtkName;
exports.removeBold = removeBold;
exports.removeBracket = removeBracket;
exports.removeHeader = removeHeader;
exports.removePunc = removePunc;
exports.removeSentenceBreak = removeSentenceBreak;
exports.removeSubPara = removeSubPara;
exports.removeSubstring = removeSubstring;
exports.renderOfftext = renderOfftext;
exports.replaceAuthor = replaceAuthor;
exports.replaceBook = replaceBook;
exports.replaceZhuyin = replaceZhuyin;
exports.resetCounter = resetCounter;
exports.runCriterion = runCriterion;
exports.sameAddress = sameAddress;
exports.samecount = samecount;
exports.sameendcount = sameendcount;
exports.saveComOption = saveComOption;
exports.savePtkOption = savePtkOption;
exports.saveSourceOption = saveSourceOption;
exports.scanText = scanText;
exports.scoreLine = scoreLine;
exports.searchSentence = searchSentence;
exports.searchSentenceSync = searchSentenceSync;
exports.sentenceFromRange = sentenceFromRange;
exports.sentencePosfromSelection = sentencePosfromSelection;
exports.sentenceRatio = sentenceRatio;
exports.sentencize = sentencize;
exports.serializeBackTransclusion = serializeBackTransclusion;
exports.serializeToc = serializeToc;
exports.setPtkFileLength = setPtkFileLength;
exports.similarSet = similarSet;
exports.sleep = sleep;
exports.sortNumberArray = sortNumberArray;
exports.sortObj = sortObj;
exports.sourceType = sourceType;
exports.spacify = spacify;
exports.splitUTF32 = splitUTF32;
exports.splitUTF32Char = splitUTF32Char;
exports.statStrIntobject = statStrIntobject;
exports.storeZip = storeZip;
exports.string2codePoint = string2codePoint;
exports.stripLinesNote = stripLinesNote;
exports.stripOfftag = stripOfftag;
exports.styledNumber = styledNumber;
exports.substrUTF32 = substrUTF32;
exports.supprtedBrowser = supprtedBrowser;
exports.syllablify = syllablify;
exports.tagAtAction = tagAtAction;
exports.tagCount = tagCount;
exports.tagInRange = tagInRange;
exports.tidyFolioText = tidyFolioText;
exports.toBase26 = toBase26;
exports.toCBETA = toCBETA;
exports.toChineseNumber = toChineseNumber;
exports.toFolioText = toFolioText;
exports.toIAST = toIAST;
exports.toIASTOffText = toIASTOffText;
exports.toIASTWord = toIASTWord;
exports.toObj = toObj;
exports.toParagraphs = toParagraphs;
exports.toPinyin = toPinyin;
exports.toSim = toSim;
exports.toVerticalPunc = toVerticalPunc;
exports.tokenize = tokenize$1;
exports.tokenizeOfftext = tokenizeOfftext;
exports.translatePointer = translatePointer;
exports.trimPunc = trimPunc;
exports.unescapeTemplateString = unescapeTemplateString;
exports.union = union;
exports.unique = unique;
exports.unique0 = unique0;
exports.unique1 = unique1;
exports.unitize = unitize;
exports.unloadScript = unloadScript;
exports.unpack1 = unpack1;
exports.unpack2 = unpack2;
exports.unpack3 = unpack3;
exports.unpack3_2d = unpack3_2d;
exports.unpackBoolean = unpackBoolean;
exports.unpackInt = unpackInt;
exports.unpackInt2d = unpackInt2d;
exports.unpackIntDelta = unpackIntDelta;
exports.unpackIntDelta2d = unpackIntDelta2d;
exports.unpackStrings = unpackStrings;
exports.updateOfftext = updateOfftext;
exports.updateUrl = updateUrl;
exports.urlPrefix = urlPrefix;
exports.usePtk = usePtk;
exports.validId = validId;
exports.validPtkName = validPtkName;
exports.validateTofind = validateTofind;
exports.validate_z = validate_z;
exports.verifyPermission = verifyPermission;
exports.walkDOM = walkDOM;
exports.walkDOMOfftext = walkDOMOfftext;
exports.writeChanged = writeChanged;
exports.writeIncObj = writeIncObj;
exports.writePitaka = writePitaka;
exports.xml2indic = xml2indic;
exports.xorStrings = xorStrings;
exports.xpath = xpath;
exports.yidarrInRange = yidarrInRange;
