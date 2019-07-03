// todo rf auth

const RF_URL = 'http://app.redforester.com';
const SAVED_NODES_KEY = 'savedNodes';

const state = {
    url: null, // Current page url
    where: null, // nodeId + mapId
    name: '', // Page name
    description: '' // Page description
};

/**
 * Save web page as RedForester node
 * @param url
 * @param mapId - id of target map
 * @param parentId - id of target node
 * @param name - page name
 * @param description - explicit description
 * @returns {Promise<Response>}
 */
async function savePage(url, mapId, parentId, name, description) {
    const linkName = description ? `${name} - ${description}`: name;
    const title = `[${linkName}](${url})`;  // todo escape title

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
            state.description
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


// popup initialization
(async function () {
    function updateStateToSelectedNode (node) {
        const nodeId = node.id;
        const mapId = node.map.id;
        state.where = {nodeId, mapId};

        const a = document.getElementById('node-link');
        a.href = `${RF_URL}/#mindmap?mapid=${node.map.id}&nodeid=${node.id}`;
    }

    // Getting current page info: url, name
    // Check if url was saved
    chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
        const currentTab = tabs[0];

        state.url = currentTab.url;
        state.name = currentTab.title || currentTab.url;

        const nodeIds = await checkIfUrlWasSaved(state.url);
        if (nodeIds) {
            // todo check if nodes are existing
            // todo node links
            document.getElementById('url-was-saved').innerText = `This page was saved ${nodeIds.length} times`;
        }
        document.getElementById('page-name').innerText = state.name

    });

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
