// todo text nodes
// todo fix checkbox css
// todo nice css

const RF_URL = 'https://beta.app.redforester.com';

// todo extend keys with userId
const SAVED_NODES_KEY = 'savedNodes';
const USE_PREVIEW_KEY = 'usePreview';
const LAST_SAVED_NODE_KEY = 'lastSavedNode';

const systemPageRe = new RegExp(/^(chrome(-extension)?(-search)?|about|moz-extension):.*$/);

const limitString = (str, length=50) => {
    let text = str.slice(0, length);
    if (text.length === length) text += '...';
    return text
};

function extractElementsText(s, maxLineCount = 0) {
    const span = document.createElement("span");
    span.innerHTML = s;

    function extractTextFromNodes(element, lines) {
        const text = [];
        let nonEmptyLines = 0;
        for (const c of element.childNodes) {
            const oldTextLength = text.length;
            let newTextLength = oldTextLength;
            if (c.childNodes.length >= 0 && c instanceof Element) {
                newTextLength = text.push(...extractTextFromNodes(c));
            } else {
                if (c.textContent) {
                    newTextLength = text.push(c.textContent);
                } else if (c instanceof HTMLElement && c.innerText) {
                    newTextLength = text.push(c.innerText);
                }
            }

            if (oldTextLength === newTextLength) continue;
            ++ nonEmptyLines;
            if (lines && nonEmptyLines === lines) break;
        }

        return text;
    }

    return extractTextFromNodes(span, maxLineCount);
}

function extractText(s, maxLineCount) {
    return extractElementsText(s, maxLineCount).join(" ");
}


function clearHtml(html) {
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}


/**
 * Save web page as RedForester node
 * @param url
 * @param mapId - id of target map
 * @param parentId - id of target node
 * @param name - page name
 * @param description - explicit description
 * @param preview - preview image url
 * @returns {Promise<Response>}
 */
async function savePage(url, mapId, parentId, name, description, preview) {
    // todo preview size

    const title = clearHtml([
        preview ? `<p><img src="${preview}"></p>` : "",
        `<p><a href="${url}" target="_blank">${name}</a></p>`,
        `<p>${description}</p>`
    ].join(""));

    const body = {
        position: ["P", -1],
        map_id: mapId,
        parent: parentId,
        properties: JSON.stringify({
            global: {title}
        })
    };

    const response = await fetch(`${RF_URL}/api/nodes`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (response.ok) {
        const newNodeInfo = await response.json();

        chrome.storage.sync.get([SAVED_NODES_KEY], function (data) {
            const savedNodes = data[SAVED_NODES_KEY] || [];
            savedNodes.push({ id: newNodeInfo.id, url });
            chrome.storage.sync.set({ [SAVED_NODES_KEY]: savedNodes })
        });

        chrome.storage.sync.set({ [LAST_SAVED_NODE_KEY]: parentId })
    }

    return response
}


/**
 * Check if user did saved url already
 * @param url
 * @returns {Promise<boolean|Array<string>>}
 */
async function checkIfUrlWasSaved(url) {
    return new Promise(resolve => {
        chrome.storage.sync.get([SAVED_NODES_KEY], function (data) {
            const savedNodes = data[SAVED_NODES_KEY] || [];
            const nodeIds = savedNodes.filter(n => n.url === url).map(n => n.id);
            nodeIds.length ? resolve(nodeIds) : resolve(false);
        })
    })
}

/**
 * Get saved usePreview value from storage.
 * @returns {Promise<boolean>}
 */
async function getUsePreview() {
    return new Promise(resolve => {
        chrome.storage.sync.get([USE_PREVIEW_KEY], function (data) {
            const saved = data[USE_PREVIEW_KEY];
            const usePreview = saved === undefined ? true : saved;
            resolve(usePreview);
        });
    })
}

/**
 * Put usePreview value to storage.
 * @param value {boolean}
 */
function putUsePreview(value) {
    chrome.storage.sync.set({ [USE_PREVIEW_KEY]: value })
}


/**
 * Code injected to tab dom to fetch image preview
 * @return {string|string | DocumentFragment}
 */
function getPreviewImage() {
    const meta = document.querySelector('meta[property="og:image"]');
    if (meta) return meta.content;
    const firstImg = document.querySelector('img');
    if (firstImg) return firstImg.src;
}


async function getUserInfo() {
    const response = await fetch(`${RF_URL}/api/user`);
    if (!response.ok) return null;

    const body = await response.json();

    if (body.username === "nobody") return null;

    return body
}

async function extractCurrentTabInfo(state) {
    const tabs = await new Promise(resolve => {
        chrome.tabs.query({currentWindow: true, active: true}, resolve);
    });

    // Getting current page info: url, name
    // Check if url was saved
    const currentTab = tabs[0];

    // Check if this page is available to access
    const test = currentTab.url.match(systemPageRe);
    if (test && test[1]) {
        return false;
    }

    state.url = currentTab.url;
    state.name = currentTab.title || currentTab.url;

    const nodeIds = await checkIfUrlWasSaved(state.url);
    if (nodeIds) {
        // todo check if nodes are existing
        document.getElementById('url-was-saved').innerText = `This page was saved ${nodeIds.length} times`;
    }
    document.getElementById('page-name').value = state.name;

    // trying to find preview image
    let preview = null;
    try {
        [preview] = await new Promise(resolve => {
            chrome.tabs.executeScript({
                code: '(' + getPreviewImage + ')();'
            }, resolve);
        });
    } catch (e) {
        console.error(e)
    }

    const savedUsePreview = await getUsePreview();

    if (preview) {
        state.preview = preview;
        state.usePreview = savedUsePreview;

        const previewCheckbox = document.getElementById('preview-checkbox');
        previewCheckbox.checked = savedUsePreview;

        previewCheckbox.onchange = (event) => {
            state.usePreview = event.target.checked;
            putUsePreview(event.target.checked);
        };

        const previewImg = document.getElementById('preview-img');
        previewImg.src = preview;

        const previewWrapper = document.getElementById('preview-wrapper');
        const previewCheckboxWrapper = document.getElementById('preview-checkbox-wrapper');
        previewCheckboxWrapper.style.display = 'block';
        previewWrapper.style.display = 'block';
    } else {
        state.preview = null;
        state.usePreview = false;
    }

    return true
}


/**
 * "Save" button click.
 * @param state
 * @return {Promise<void>}
 */
async function saveAction (state) {
    console.log(state);

    if (state.where === null || state.url === null) return alert('Select the node');

    const response = await savePage(
        state.url,
        state.where.mapId,
        state.where.nodeId,
        state.name,
        state.description,
        state.usePreview && state.preview,
    );

    const notifyOptions = {
        type: 'basic',
        title: 'RedForester',
        message: 'Success',
        iconUrl: '/icons/icon128.png'
    };

    if (!response.ok) {
        notifyOptions.message = `Can not create the node :(\n${response.status}`;
    }

    chrome.notifications.create('main', notifyOptions, () => window.close());
}

function toggleLoader() {
    document.getElementById('loader-wrapper').classList.toggle('visibility-hidden');
    document.getElementById('popup-wrapper').classList.toggle('visibility-hidden');
}

function page(component) {
    const wrapper = document.getElementById('loader-wrapper');

    wrapper.innerHTML = `
        <div style="margin: auto;">
            ${component()}
        </div>
    `;
}

function noAuthAction() {
    return `
        <h3>Can not authorize in RedForester service.</h3>
        <p>Please try to <a href="${RF_URL}/login" target="_blank">login</a> first.</p>
    `;
}

function nopeAction() {
    return `
        <h3>This is unavailable page.</h3>
        <p>This plugin can not access this tab</p>
    `;
}


/**
 * popup initialization
 */
(async function () {
    const state = {
        url: null, // Current page url
        where: null, // nodeId + mapId
        name: '', // Page name
        description: '', // Page description
        preview: null, // Page preview url
        usePreview: true, // Add preview to node title?
    };

    function updateStateToSelectedNode (state, node) {
        if (!node) return;

        const nodeId = node.id;
        const mapId = node.map.id;
        state.where = {nodeId, mapId};

        const a = document.getElementById('node-link');
        a.href = `${RF_URL}/#mindmap?mapid=${node.map.id}&nodeid=${node.id}`;
    }

    const [allowedPage, userInfo] = await Promise.all([
        extractCurrentTabInfo(state),
        getUserInfo()
    ]);
    if (!allowedPage) return page(nopeAction);
    if (!userInfo) return page(noAuthAction);

    toggleLoader();

    // Select box initialization
    const favoriteNodeTag = userInfo.tags[0]; // favorite nodes tag. fixme in rf
    const favoriteNodes = await (await fetch(`${RF_URL}/api/tags/${favoriteNodeTag.id}`)).json();

    const select = document.getElementById('favorite-nodes-select');

    // Create options list and select last selected or first
    chrome.storage.sync.get([LAST_SAVED_NODE_KEY], function (data) {
        const lastSelectedId = data[LAST_SAVED_NODE_KEY];
        const lastSelected = favoriteNodes.find(n => n.id === lastSelectedId) || favoriteNodes[0];

        for (let node of favoriteNodes) {
            // We have no access to this favorite node
            if (node.title === null) continue;

            const option = select.appendChild(document.createElement('option'));
            option.value = node.id;
            option.innerText = `${node.map.name} / ${limitString(extractText(clearHtml(node.title), 1))}`;
            if (lastSelected && lastSelected.id === node.id) {
                option.selected = true
            }
        }

        updateStateToSelectedNode(state, lastSelected);
    });

    // "Save" action
    document
        .getElementById('save-button')
        .addEventListener('click', async () => saveAction(state));

    // Watch for node selection
    select.addEventListener('change', event => {
        const favoriteNode = favoriteNodes.find(n => n.id === event.target.value);
        updateStateToSelectedNode(state, favoriteNode)
    });

    // Watch for page name
    document
        .getElementById('page-name')
        .addEventListener('change', event => state.name = event.target.value);

    // Watch for description
    document
        .getElementById('page-description')
        .addEventListener('change', event => state.description = event.target.value)
})();
