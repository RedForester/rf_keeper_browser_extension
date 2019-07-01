const RF_URL = 'http://app.redforester.com';

const state = {
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

    return fetch(`${RF_URL}/api/nodes`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
}

// Действие при нажатии "сохранить"
document
    .getElementById('save-button')
    .addEventListener('click', async function () {
        if (state.where === null) return alert('Выберите узел');

        chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
            const currentTab = tabs[0];

            const response = await savePage(
                currentTab.url,
                state.where.mapId,
                state.where.nodeId,
                state.name,
                state.description
            );

            alert(response.status); // todo notifications
            window.close();
        });
});



// Инициализация popup
(async function () {
    // Получение имени страницы
    chrome.tabs.query({currentWindow: true, active: true}, function (tabs) {
        const currentTab = tabs[0];

        state.name = currentTab.title || currentTab.url;
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
        option.innerText = node.title;
    }

    // Слежение за выбором узла
    select.addEventListener('change', event => {
        const nodeId = event.target.value;
        const mapId = favoriteNodes.find(n => n.id === nodeId).map.id;
        state.where = {nodeId, mapId};
    });

    // Слежение за описанием
    document
        .getElementById('page-description')
        .addEventListener('change', event => state.description = event.target.value)
})();
