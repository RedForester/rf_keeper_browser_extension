const RF_URL = 'http://app.redforester.com';
const SAVED_NODES_KEY = 'savedNodes';
const USE_PREVIEW_KEY = 'usePreview';

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
    const linkName = description ? `${name} - ${description}`: name;

    let title = `[${linkName}](${url})`; // todo escape title
    if (preview) {
        title = `![preview](${preview})\n\n${title}`;
    }

    const body = {
        position: ["P", -1],
        map_id: mapId,
        parent: parentId,
        properties: JSON.stringify({
            global: {title}
        })
    };

    // todo try catch, !ok
    const response = await fetch(`${RF_URL}/api/nodes`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    const newNodeInfo = await response.json();

    chrome.storage.sync.get([SAVED_NODES_KEY], function (data) {
        const savedNodes = data[SAVED_NODES_KEY] || [];
        savedNodes.push({ id: newNodeInfo.id, url });
        chrome.storage.sync.set({ [SAVED_NODES_KEY]: savedNodes })
    });

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

    return response.json()
}


async function extractCurrentTabInfo(state) {
    const tabs = await new Promise(resolve => {
        chrome.tabs.query({currentWindow: true, active: true}, resolve);
    });

    // Getting current page info: url, name
    // Check if url was saved
    const currentTab = tabs[0];

    state.url = currentTab.url;
    state.name = currentTab.title || currentTab.url;

    const nodeIds = await checkIfUrlWasSaved(state.url);
    if (nodeIds) {
        // todo check if nodes are existing
        // todo node links
        document.getElementById('url-was-saved').innerText = `This page was saved ${nodeIds.length} times`;
    }
    document.getElementById('page-name').innerText = state.name;

    // trying to find preview image
    const [preview] = await new Promise(resolve => {
        chrome.tabs.executeScript({
            code: '(' + getPreviewImage + ')();'
        }, resolve);
    });

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

        const previewContainer = document.getElementById('preview-container');
        previewContainer.style.display = 'block';
    } else {
        state.preview = null;
        state.usePreview = false;
    }
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


/**
 * If popup can not fetch user info from RedForester
 */
function noAuthAction() {
    const wrapper = document.getElementById('popup-wrapper');

    wrapper.innerHTML = `
        <h3>Can not authorize in RedForester service.</h3>
        Please try to <a href="http://app.redforester.com/login" target="_blank">login</a> first.
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
        const nodeId = node.id;
        const mapId = node.map.id;
        state.where = {nodeId, mapId};

        const a = document.getElementById('node-link');
        a.href = `${RF_URL}/#mindmap?mapid=${node.map.id}&nodeid=${node.id}`;
    }

    extractCurrentTabInfo(state);

    const userInfo = await getUserInfo();
    if (!userInfo) return noAuthAction();

    // todo hide loading spinner

    // Select box initialization
    const favoriteNodeTag = userInfo.tags[0]; // fixme, rf
    const favoriteNodes = await (await fetch(`${RF_URL}/api/tags/${favoriteNodeTag.id}`)).json();
    const select = document.getElementById('favorite-nodes-select');
    for (let node of favoriteNodes) {
        const option = select.appendChild(document.createElement('option'));
        option.value = node.id;
        option.innerText = `${node.map.name} / ${node.title}`;
    }
    updateStateToSelectedNode(state, favoriteNodes[0]); // todo synced sort

    // "Save" action
    document
        .getElementById('save-button')
        .addEventListener('click', async () => saveAction(state));

    // Watch for node selection
    select.addEventListener('change', event => {
        const favoriteNode = favoriteNodes.find(n => n.id === event.target.value);
        updateStateToSelectedNode(state, favoriteNode)
    });

    // Watch for description
    document
        .getElementById('page-description')
        .addEventListener('change', event => state.description = event.target.value)
})();
