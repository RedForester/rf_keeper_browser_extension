const saveButton = document.getElementById('saveButton');

const MAP_ID = "0d2160f1-83b4-4afd-8887-ac18e520cc90";
const PARENT_ID = "462d3e99-d8da-4af1-82e6-5a7ed7b18637";

saveButton.onclick = async function () {
    chrome.tabs.query({ currentWindow: true, active: true }, async function (tabs) {
        const currentTab = tabs[0];
        const header = currentTab.title || currentTab.url;
        const description = prompt('Имя'); // todo proper gui

        const response = await savePage(currentTab, MAP_ID, PARENT_ID, header, description);

        alert(response.status) // todo notifications
    });
};

async function savePage(currentTab, mapId, parentId, header, description) {
    // todo escape title
    const title = `[${header} - ${description}](${currentTab.url})`;

    const body = {
        position: ["P", -1],
        map_id: mapId,
        parent: parentId,
        properties: JSON.stringify({
            global: { title: title }
        })
    };

    // todo host config?
    return fetch('http://app.redforester.com/api/nodes', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
}
