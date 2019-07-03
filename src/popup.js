// todo rf auth

const RF_URL = 'http://app.redforester.com';
const SAVED_NODES_KEY = 'savedNodes';

const state = {
    url: null, // Current page url
    where: null, // nodeId + mapId
    name: '', // Page name
    description: '', // Page description
    preview: null, // Page preview url
    usePreview: true, // Add preview to node title?
};

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
            console.log(savedNodes, nodeIds);
            nodeIds.length ? resolve(nodeIds) : resolve(false);
        })
    })
}


// "Save" action
document
    .getElementById('save-button')
    .addEventListener('click', async function () {
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
            iconUrl: '/icons/icon16.png'
        };

        if (!response.ok) {
            notifyOptions.message = `Can not create the node :(\n${response.status}`;
        }

        chrome.notifications.create('main', notifyOptions, () => window.close());
    });

function getPreviewImage() {
    const meta = document.querySelector('meta[property="og:image"]');
    if (meta) return meta.content;
    const firstImg = document.querySelector('img');
    if (firstImg) return firstImg.src;
}

async function extractCurrentTabInfo() {
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

    if (preview) {
        state.preview = preview;
        state.usePreview = true;

        const previewCheckbox = document.getElementById('preview-checkbox');
        previewCheckbox.checked = true;
        previewCheckbox.onchange = (event) => state.usePreview = event.target.checked;

        const previewImg = document.getElementById('preview-img');
        previewImg.src = preview;

        const previewContainer = document.getElementById('preview-container');
        previewContainer.style.display = 'block';
    } else {
        state.preview = null;
        state.usePreview = false;
    }
}

// popup initialization
(async function () {
    function updateStateToSelectedNode (node) {
        const nodeId = node.id;
        const mapId = node.map.id;
        state.where = {nodeId, mapId};

        const a = document.getElementById('node-link');
        a.href = `${RF_URL}/#mindmap?mapid=${node.map.id}&nodeid=${node.id}`;
    }

    extractCurrentTabInfo();

    // Select box initialization
    const favoriteNodesWrapper = document.getElementById('favorite-nodes');
    const select = favoriteNodesWrapper.appendChild(document.createElement('select'));

    const userInfo = await (await fetch(`${RF_URL}/api/user`)).json();
    const favoriteNodeTag = userInfo.tags[0]; // fixme, rf
    const favoriteNodes = await (await fetch(`${RF_URL}/api/tags/${favoriteNodeTag.id}`)).json();

    for (let node of favoriteNodes) {
        const option = select.appendChild(document.createElement('option'));
        option.value = node.id;
        option.innerText = `${node.map.name} / ${node.title}`;
    }
    updateStateToSelectedNode(favoriteNodes[0]);

    // Watch for node selection
    select.addEventListener('change', event => {
        const favoriteNode = favoriteNodes.find(n => n.id === event.target.value);
        updateStateToSelectedNode(favoriteNode)
    });

    // Watch for description
    document
        .getElementById('page-description')
        .addEventListener('change', event => state.description = event.target.value)
})();
