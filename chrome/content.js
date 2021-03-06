/**
 * Copyright 2011 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @author opensource@google.com
 * @license Apache License, Version 2.0.
 */

// Extension namespace.
var xh = xh || {};

////////////////////////////////////////////////////////////
// Generic helper functions and constants

xh.SHIFT_KEYCODE = 16;
xh.X_KEYCODE = 88;

xh.elementsShareFamily = function (primaryEl, siblingEl) {
  var p = primaryEl, s = siblingEl;
  return (p.tagName === s.tagName &&
    (!p.className || p.className === s.className) &&
    (!p.id || p.id === s.id));
};

xh.getElementIndex = function (el) {
  var index = 1;  // XPath is one-indexed
  var sib;
  for (sib = el.previousSibling; sib; sib = sib.previousSibling) {
    if (sib.nodeType === Node.ELEMENT_NODE && xh.elementsShareFamily(el, sib)) {
      index++;
    }
  }
  if (index > 1) {
    return index;
  }
  for (sib = el.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.nodeType === Node.ELEMENT_NODE && xh.elementsShareFamily(el, sib)) {
      return 1;
    }
  }
  return 0;
};
xh.suggestXpath = function (oriElement, queryOut) {
  var query = [];
  if (oriElement == null) return "";

  // plan A: use tex()  P0
  if (oriElement.textContent && oriElement.textContent.length < 20) {
    query.push("//" + oriElement.tagName.toLowerCase() + '[text()="' + oriElement.textContent + '"]')
  }

  // plan B: use id,if has ID
  if (queryOut) {
    var pureText = "//" + oriElement.tagName.toLowerCase() + '[text()="' + oriElement.textContent + '"]';
    var list = queryOut.split("\/")

    if ((oriElement.textContent !== "") && (oriElement.textContent.trim() !== "")) {
      if (list.length > 3) {
        var p1 = "//" + list[list.length - 2].replace(/\[\d+\]/, "") + pureText;
        var p2 = "//" + list[list.length - 3].replace(/\[\d+\]/, "") + "/" + list[list.length - 2] + pureText;

        if (xh.evaluateUniqueClassName(p1) === 1) {
          query.push(p1)
        } else if (xh.evaluateUniqueClassName(p2) === 1) {
          query.push(p2)
        }
      }
    } else {
      var p3 = "//" + list[list.length - 2].replace(/\[\d+\]/, "") + "/" + list[list.length - 1]
      if (xh.evaluateUniqueClassName(p3) === 1) {
        query.push(p3)
      }
    }

  }
  //plan C: use className unique
  var classNames = oriElement.getAttribute("class");
  //document.getElementById()


  //plan D: patch for vue.js
  var vueJsProp = xh.getElementByTagProp(oriElement);
  if (vueJsProp) {
    query.push(vueJsProp + "//" + oriElement.tagName.toLowerCase())
  }
  chrome.runtime.sendMessage({
    type: 'suggest',
    query: query,
  });
}
/**
 * get Parent Element that has text
 * @param el
 */
xh.getParentHasText = function (el) {
  var strL1 = ""
  var strL2 = ""
  var strL3 = ""
  if (el) {
    strL1 = el.innerText
    if (el.parent) {
      strL2 = el.parent.innerText
      if (el.parent.parent) {
        strL3 = el.parent.parent.innerText
      }
    }
  }
}
/**
 * find parent  <div prop='abc'>  for vue.js
 */
xh.getElementByTagProp = function (el) {
  if (el == null) return null;
  var newElement = el;
  var out = null;
  var level = 0;
  var commentText = "";
  while (newElement) {
    level++;

    if (newElement.getAttribute("prop")) {

      if (newElement.innerText && newElement.innerText.length < 20) {
        commentText = newElement.innerText
      }
      out = "//" + newElement.tagName.toLowerCase() + "[@prop='" + newElement.getAttribute("prop") + "'" + " and '" + commentText + "']"
      return out;
    }
    if (level > 10) break;
    newElement = newElement.parentNode;
    if (newElement === document) break;
  }
  return out;
}
xh.makeQueryForElement = function (el) {
  var query = '';
  var originEl = el;
  for (; el && el.nodeType === Node.ELEMENT_NODE; el = el.parentNode) {
    var component = el.tagName.toLowerCase();
    var index = xh.getElementIndex(el);
    if (el.id) {
      component += '[@id=\'' + el.id + '\']';
      query = '//' + component + query
      xh.suggestXpath(originEl, query)
      return query
    } else if (el.className) {
      component += '[@class=\'' + el.className + '\']';
    }
    if (index >= 1) {
      component += '[' + index + ']';
    }
    // If the last tag is an img, the user probably wants img/@src.
    if (query === '' && el.tagName.toLowerCase() === 'img') {
      component += '/@src';
    }
    query = '/' + component + query;
  }
  xh.suggestXpath(originEl, query)

  return query;
};

xh.highlight = function (els) {
  for (var i = 0, l = els.length; i < l; i++) {
    els[i].classList.add('xh-highlight');
  }
};

xh.clearHighlights = function () {
  var els = document.querySelectorAll('.xh-highlight');
  for (var i = 0, l = els.length; i < l; i++) {
    els[i].classList.remove('xh-highlight');
  }
};

// Returns [values, nodeCount]. Highlights result nodes, if applicable. Assumes
// no nodes are currently highlighted.
xh.evaluateQuery = function (query) {
  var xpathResult = null;
  var str = '';
  var nodeCount = 0;
  var toHighlight = [];

  try {
    xpathResult = document.evaluate(query, document, null,
      XPathResult.ANY_TYPE, null);
  } catch (e) {
    str = '[INVALID XPATH EXPRESSION]';
    nodeCount = 0;
  }

  if (!xpathResult) {
    return [str, nodeCount];
  }

  if (xpathResult.resultType === XPathResult.BOOLEAN_TYPE) {
    str = xpathResult.booleanValue ? '1' : '0';
    nodeCount = 1;
  } else if (xpathResult.resultType === XPathResult.NUMBER_TYPE) {
    str = xpathResult.numberValue.toString();
    nodeCount = 1;
  } else if (xpathResult.resultType === XPathResult.STRING_TYPE) {
    str = xpathResult.stringValue;
    nodeCount = 1;
  } else if (xpathResult.resultType ===
    XPathResult.UNORDERED_NODE_ITERATOR_TYPE) {
    for (var node = xpathResult.iterateNext(); node;
         node = xpathResult.iterateNext()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        toHighlight.push(node);
      }
      if (str) {
        str += '\n';
      }
      str += node.textContent;
      nodeCount++;
    }
    if (nodeCount === 0) {
      str = '[NULL]';
    }
  } else {
    // Since we pass XPathResult.ANY_TYPE to document.evaluate(), we should
    // never get back a result type not handled above.
    str = '[INTERNAL ERROR]';
    nodeCount = 0;
  }

  xh.highlight(toHighlight);
  return [str, nodeCount];
};

/**
 * find out is th unique xpath.
 * @param query
 * @return number
 */
xh.evaluateUniqueClassName = function (query) {
  var xpathResult = null;
  var nodeCount = 0;

  try {
    xpathResult = document.evaluate(query, document, null,
      XPathResult.ANY_TYPE, null);
  } catch (e) {
    nodeCount = 0;
  }

  if (!xpathResult) {
    return nodeCount
  }

  if (xpathResult.resultType === XPathResult.BOOLEAN_TYPE) {
    nodeCount = 1;
  } else if (xpathResult.resultType === XPathResult.NUMBER_TYPE) {
    nodeCount = 1;
  } else if (xpathResult.resultType === XPathResult.STRING_TYPE) {
    nodeCount = 1;
  } else if (xpathResult.resultType ===
    XPathResult.UNORDERED_NODE_ITERATOR_TYPE) {
    for (var node = xpathResult.iterateNext(); node;
         node = xpathResult.iterateNext()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
      }

      nodeCount++;
    }
    if (nodeCount === 0) {
    }
  } else {
    nodeCount = 0;
  }

  return nodeCount
};


////////////////////////////////////////////////////////////
// xh.Bar class definition

xh.Bar = function () {
  this.boundHandleRequest_ = this.handleRequest_.bind(this);
  this.boundMouseMove_ = this.mouseMove_.bind(this);
  this.boundKeyDown_ = this.keyDown_.bind(this);

  this.inDOM_ = false;
  this.currEl_ = null;

  this.barFrame_ = document.createElement('iframe');
  this.barFrame_.src = chrome.runtime.getURL('bar.html');
  this.barFrame_.id = 'xh-bar';
  this.barFrame_.style.maxWidth = 'initial';

  // Init to hidden so first showBar_() triggers fade-in.
  this.barFrame_.classList.add('hidden');

  document.addEventListener('keydown', this.boundKeyDown_);
  chrome.runtime.onMessage.addListener(this.boundHandleRequest_);
};

xh.Bar.prototype.hidden_ = function () {
  return this.barFrame_.classList.contains('hidden');
};

xh.Bar.prototype.updateQueryAndBar_ = function (el) {
  xh.clearHighlights();
  this.query_ = el ? xh.makeQueryForElement(el) : '';
  this.updateBar_(true);
};

xh.Bar.prototype.updateBar_ = function (updateQuery) {
  var results = this.query_ ? xh.evaluateQuery(this.query_) : ['', 0];
  chrome.runtime.sendMessage({
    type: 'update',
    query: updateQuery ? this.query_ : null,
    results: results
  });
};

xh.Bar.prototype.showBar_ = function () {
  var that = this;

  function impl() {
    that.barFrame_.classList.remove('hidden');
    document.addEventListener('mousemove', that.boundMouseMove_);
    that.updateBar_(true);
  }

  if (!this.inDOM_) {
    this.inDOM_ = true;
    document.body.appendChild(this.barFrame_);
  }
  window.setTimeout(impl, 0);
};

xh.Bar.prototype.hideBar_ = function () {
  var that = this;

  function impl() {
    that.barFrame_.classList.add('hidden');
    document.removeEventListener('mousemove', that.boundMouseMove_);
    xh.clearHighlights();
  }

  window.setTimeout(impl, 0);
};

xh.Bar.prototype.toggleBar_ = function () {
  if (this.hidden_()) {
    this.showBar_();
  } else {
    this.hideBar_();
  }
};

xh.Bar.prototype.handleRequest_ = function (request, sender, cb) {
  if (request.type === 'evaluate') {
    xh.clearHighlights();
    this.query_ = request.query;
    this.updateBar_(false);
  } else if (request.type === 'moveBar') {
    // Move iframe to a different part of the screen.
    this.barFrame_.classList.toggle('bottom');
  } else if (request.type === 'hideBar') {
    this.hideBar_();
    window.focus();
  } else if (request.type === 'toggleBar') {
    this.toggleBar_();
  }
};

xh.Bar.prototype.mouseMove_ = function (e) {
  if (this.currEl_ === e.toElement) {
    return;
  }
  this.currEl_ = e.toElement;
  if (e.shiftKey) {
    this.updateQueryAndBar_(this.currEl_);
  }
};

xh.Bar.prototype.keyDown_ = function (e) {
  var ctrlKey = e.ctrlKey || e.metaKey;
  var shiftKey = e.shiftKey;
  if (e.keyCode === xh.X_KEYCODE && ctrlKey && shiftKey) {
    this.toggleBar_();
  }
  // If the user just pressed Shift and they're not holding Ctrl, update query.
  // Note that we rely on the mousemove handler to have updated this.currEl_.
  // Also, note that checking e.shiftKey wouldn't work here, since Shift is the
  // key that triggered this event.
  if (!this.hidden_() && !ctrlKey && e.keyCode === xh.SHIFT_KEYCODE) {
    this.updateQueryAndBar_(this.currEl_);
  }
};

////////////////////////////////////////////////////////////
// Initialization code

if (location.href.indexOf('acid3.acidtests.org') === -1) {
  window.xhBarInstance = new xh.Bar();
}
