// todo отсутствие авторизации в rf
const RF_URL = 'http://app.redforester.com';
const SAVED_NODES_KEY = 'savedNodes';

const state = {
    url: null, // url текущей вкладки
    where: null, // nodeId + mapId
    name: '', // Имя страницы
    description: '' // Описание страницы
};

/**
 * Сохранение страницы в виде узла в RF
 * @param url - Адрес страницы
 * @param mapId - id карты, куда сохранять
 * @param parentId - id узла, куда сохранять
 * @param name - Имя страницы
 * @param description - Описание страницы
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
 * Проверка в каких узлах, сохранен текущий url
 * @param url - Адрес страницы
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


// Действие при нажатии "сохранить"
document
    .getElementById('save-button')
    .addEventListener('click', async function () {
        if (state.where === null || state.url === null) return alert('Выберите узел');

        const response = await savePage(
            state.url,
            state.where.mapId,
            state.where.nodeId,
            state.name,
            state.description
        );

        alert(response.status); // todo notifications
        window.close();
});


// Инициализация popup
(async function () {
    function updateLinkToSelectedNode (node) {
        const a = document.getElementById('node-link');
        a.href = `${RF_URL}/#mindmap?mapid=${node.map.id}&nodeid=${node.id}`;
    }

    // Получение имени страницы, url. Проверка был ли уже сохранена
    chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
        const currentTab = tabs[0];

        state.url = currentTab.url;
        state.name = currentTab.title || currentTab.url;

        const nodeIds = await checkIfUrlWasSaved(state.url);
        if (nodeIds) {
            // todo проверить, что узлы сейчас существуют и содержат этот url
            // todo где именно?
            document.getElementById('url-was-saved').innerText = `Эта страница уже была сохранена (${nodeIds.length} раз(а))`;
        }
        document.getElementById('page-name').innerText = state.name

    });

    // Создание и заполнение выбиралки узлов
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
    updateLinkToSelectedNode(favoriteNodes[0]);

    // Слежение за выбором узла
    select.addEventListener('change', event => {
        const favoriteNode = favoriteNodes.find(n => n.id === event.target.value);
        const nodeId = favoriteNode.id;
        const mapId = favoriteNode.map.id;
        state.where = {nodeId, mapId};

        updateLinkToSelectedNode(favoriteNode)
    });

    // Слежение за описанием
    document
        .getElementById('page-description')
        .addEventListener('change', event => state.description = event.target.value)
})();
