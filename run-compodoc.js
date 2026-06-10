const originalRegExp = RegExp;
const originalSearch = String.prototype.search;
const originalMatch = String.prototype.match;
const originalReplace = String.prototype.replace;
const originalSplit = String.prototype.split;

function escapePathInPattern(pattern) {
  // Use the cached original functions to avoid infinite recursion
  pattern = originalSplit.call(pattern, '1.)').join('__PARENTHESIS_PLACEHOLDER__');
  pattern = originalSplit.call(pattern, '1\\.)').join('__PARENTHESIS_PLACEHOLDER__');
  pattern = originalSplit.call(pattern, '1\\\\.\\\\)').join('__PARENTHESIS_PLACEHOLDER__');
  pattern = originalSplit.call(pattern, '1\\\\.\\)').join('__PARENTHESIS_PLACEHOLDER__');
  pattern = originalSplit.call(pattern, '1\\.\\\\)').join('__PARENTHESIS_PLACEHOLDER__');

  // If pattern has Windows-style backslashes that are not escaped, escape them.
  if (/[A-Za-z]:\\[^\\\/]/.test(pattern) || originalSearch.call(pattern, /\\DABubble\\/) !== -1 || originalSearch.call(pattern, /\\Gruppenarbeit\\/) !== -1) {
    pattern = originalReplace.call(pattern, /\\/g, '\\\\');
  }

  // Restore the placeholder to the exact correct RegExp escape sequence
  pattern = originalSplit.call(pattern, '__PARENTHESIS_PLACEHOLDER__').join('1\\.\\)');

  return pattern;
}

global.RegExp = function (pattern, flags) {
  try {
    return new originalRegExp(pattern, flags);
  } catch (err) {
    if (typeof pattern === 'string' && (pattern.includes('Gruppenarbeit') || pattern.includes('DABubble') || pattern.includes('1.)'))) {
      const fixedPattern = escapePathInPattern(pattern);
      try {
        return new originalRegExp(fixedPattern, flags);
      } catch (innerErr) {}
    }
    throw err;
  }
};

global.RegExp.prototype = originalRegExp.prototype;
Object.getOwnPropertyNames(originalRegExp).forEach(prop => {
  if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
    try {
      global.RegExp[prop] = originalRegExp[prop];
    } catch (e) {}
  }
});

// Patch String prototype methods which coerce strings to RegExps internally using native intrinsics
String.prototype.search = function (regexp) {
  if (typeof regexp === 'string' && (regexp.includes('Gruppenarbeit') || regexp.includes('DABubble') || regexp.includes('1.)'))) {
    regexp = escapePathInPattern(regexp);
  }
  return originalSearch.call(this, regexp);
};

String.prototype.match = function (regexp) {
  if (typeof regexp === 'string' && (regexp.includes('Gruppenarbeit') || regexp.includes('DABubble') || regexp.includes('1.)'))) {
    regexp = escapePathInPattern(regexp);
  }
  return originalMatch.call(this, regexp);
};

String.prototype.replace = function (searchValue, replaceValue) {
  if (typeof searchValue === 'string' && (searchValue.includes('Gruppenarbeit') || searchValue.includes('DABubble') || searchValue.includes('1.)'))) {
    searchValue = escapePathInPattern(searchValue);
  }
  return originalReplace.call(this, searchValue, replaceValue);
};

String.prototype.split = function (separator, limit) {
  if (typeof separator === 'string' && (separator.includes('Gruppenarbeit') || separator.includes('DABubble') || separator.includes('1.)'))) {
    separator = escapePathInPattern(separator);
  }
  return originalSplit.call(this, separator, limit);
};

// Run the original compodoc CLI
require('./node_modules/@compodoc/compodoc/bin/index-cli.js');
