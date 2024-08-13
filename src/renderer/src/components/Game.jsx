import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useRootStore } from './Root'
import { useEffect, useState } from 'react'
import { create } from 'zustand'

function NavTab({ to, name }) {
    return (
        <NavLink className={({ isActive, isPending }) =>
            isPending
                ? "tab text-custom-text"
                : isActive
                    ? "tab tab-active text-custom-text-light"
                    : "tab text-custom-text"
        }
            to={to} role="tab">
            {name}
        </NavLink>
    )
}

const useGameStore = create(set => ({
    backgroundImage: '',
    setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
    characterImage: [],
    updateCharacterImage: (characterImage) => set(state => ({ characterImage: [...state.characterImage, characterImage] })),
    setCharacterImage: (characterImage) => set({ characterImage }),
    coverImage: '',
    setCoverImage: (coverImage) => set({ coverImage }),
}));

function Game({ index }) {
    const naivgate = useNavigate();
    const { backgroundImage, setBackgroundImage, characterImage, updateCharacterImage, setCharacterImage, setCoverImage } = useGameStore();
    const { data, setData, setAlert, updateData, timestamp, config, updateConfig } = useRootStore();
    const gameData = data[index]['detail'];
    const characterData = data[index]['characters'];
    const { settingData, setSettingData } = useGameSetting();
    function getFormattedDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }
    function getFormattedDateTimeWithSeconds() {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    useEffect(() => {
        setCharacterImage([]);
        async function loadImagePath() {
            const path = await window.electron.ipcRenderer.invoke('get-data-path', gameData.backgroundImage);
            setBackgroundImage(path);
        }
        loadImagePath();
    }, [gameData.backgroundImage]);

    useEffect(() => {
        async function loadImagePath() {
            characterData.forEach(async (character) => {
                const path = await window.electron.ipcRenderer.invoke('get-data-path', character['cover']);
                updateCharacterImage(path);
            })
        }
        loadImagePath();
    }, [characterData]);

    useEffect(() => {
        async function loadImagePath() {
            const path = await window.electron.ipcRenderer.invoke('get-data-path', gameData.cover);
            setCoverImage(path);
        }
        loadImagePath();
    }, [gameData.cover]);
    // 使用示例
    useEffect(() => {
        window.electron.ipcRenderer.on('game-start-result', (event, result) => {
            if (result.success) {
                return
            } else {
                setAlert(result.error);
                setTimeout(() => { setAlert('') }, 3000);
            }
        });

        window.electron.ipcRenderer.on('monitoring-result', (event, { id, totalRunTime }) => {
            if (id === gameData['id']) {
                updateData([index, 'detail', 'gameDuration'], data[index]['detail']['gameDuration'] + totalRunTime);
                updateData([index, 'detail', 'lastVisitDate'], getFormattedDate());
                if (totalRunTime >= 1) {
                    updateData([index, 'detail', 'frequency'], data[index]['detail']['frequency'] + 1);
                    if (config['cloudSync']['enabled']) {
                        if (config['cloudSync']['mode'] === 'github') {
                            if (config['cloudSync']['github']['repoUrl']) {
                                const time = getFormattedDateTimeWithSeconds()
                                window.electron.ipcRenderer.invoke('cloud-sync-github', time).then((data) => {
                                    if (data === 'success') {
                                        setAlert('云同步成功')
                                        updateConfig(['cloudSync', 'github', 'lastSyncTime'], time)
                                        setTimeout(() => { setAlert('') }, 3000)
                                    } else {
                                        setAlert('云同步失败，请检查设置')
                                        setTimeout(() => { setAlert('') }, 3000)
                                    }
                                })
                            }
                        } else if (config['cloudSync']['mode'] === 'webdav') {
                            if (config['cloudSync']['webdav']['url']) {
                                const time = getFormattedDateTimeWithSeconds()
                                window.electron.ipcRenderer.invoke('cloud-sync-webdav-upload', config['cloudSync']['webdav']['url'], config['cloudSync']['webdav']['username'], config['cloudSync']['webdav']['password'], config['cloudSync']['webdav']['path']).then((data) => {
                                    if (data === 'success') {
                                        setAlert('云同步成功')
                                        updateConfig(['cloudSync', 'webdav', 'lastSyncTime'], time)
                                        setTimeout(() => { setAlert('') }, 3000)
                                    } else {
                                        setAlert('云同步失败，请检查设置')
                                        setTimeout(() => { setAlert('') }, 3000)
                                    }
                                })
                            }
                        }
                    }
                    try {
                        const saveId = (data[index]['saves'][0] ? data[index]['saves'][data[index]['saves'].length - 1]['id'] + 1 : 1) // 使用时间戳作为唯一标识符
                        window.electron.ipcRenderer.invoke('copy-save', data[index]['detail']['savePath'], data[index]['detail']['id'], saveId);
                        updateData([index, 'saves'], [...data[index]['saves'], {
                            id: saveId,
                            date: getFormattedDateTimeWithSeconds(),
                            note: '',
                            path: `/${data[index]['detail']['id']}/saves/${saveId}`
                        }]);
                    } catch (e) {
                        console.log(e)
                    }
                }
            } else {
                return
            }
        });

        return () => {
            window.electron.ipcRenderer.removeAllListeners('exe-open-result');
            window.electron.ipcRenderer.removeAllListeners('exe-running-time');
            window.electron.ipcRenderer.removeAllListeners('monitoring-result');
        };
    }, [data]);
    function handleStart() {
        if (gameData['gamePath'] !== '') {
            window.electron.ipcRenderer.send('open-and-monitor', gameData['gamePath'], gameData['id'])
        } else {
            setAlert('游戏路径未设置，请前往设置!')
            setTimeout(() => { setAlert('') }, 3000)
        }
    }
    function quitSetting() {
        setSettingData(data[index])
    }
    function formatTime(seconds) {
        if (seconds < 0) {
            return "无效时间";
        }

        if (seconds < 60) {
            return "小于一分钟";
        }

        const minutes = Math.floor(seconds / 60);
        const hours = minutes / 60;

        if (hours < 1) {
            return `${minutes}分钟`;
        } else {
            return `${hours.toFixed(1)}小时`;
        }
    }
    function convertStatus(status) {
        const statusMap = {
            0: "未开始",
            1: "游玩中",
            2: "已完成",
            3: "多周目"
        };

        return statusMap[status] || "未知状态";
    }
    function openFolderInExplorer(path) {
        window.electron.ipcRenderer.send('open-folder-in-explorer', path);
    }
    function deleteGame() {
        window.electron.ipcRenderer.send('delete-game', index);
        document.getElementById('deleteGame').close();
        naivgate(`../${index - 1}`)
    }
    return (
        <div className="flex flex-col w-full h-full overflow-auto scrollbar-base scrollbar-w-2 bg-custom-main/90 text-custom-text">
            <dialog id="deleteGame" className="modal">
                <div className="w-1/3 h-auto modal-box bg-custom-main-6">
                    <form method="dialog">
                        {/* if there is a button in form, it will close the modal */}
                        <button className="absolute btn btn-sm btn-ghost right-2 top-2" onClick={quitSetting}>✕</button>
                    </form>
                    <div className='w-full h-full p-3'>
                        <div className='font-bold'>确定要删除该游戏？</div>
                        <div className='flex flex-row-reverse gap-5 pt-7'>
                            <button className='transition-all btn bg-custom-main-7 text-custom-text-light hover:brightness-125' onClick={() => { document.getElementById('deleteGame').close() }}>取消</button>
                            <button className='transition-all btn bg-custom-main-7 text-custom-text-light hover:bg-custom-red' onClick={deleteGame} >确定</button>
                        </div>
                    </div>
                </div>
            </dialog>

            <dialog id="gameSetting" className="modal">
                <div className="w-3/5 max-w-full max-h-full h-5/6 modal-box bg-custom-main-6">
                    <form method="dialog">
                        {/* if there is a button in form, it will close the modal */}
                        <button className="absolute btn btn-sm btn-ghost right-2 top-2" onClick={quitSetting}>✕</button>
                    </form>
                    <div className='w-full h-full p-6 pl-10 pr-10'>
                        <Setting index={index} />
                    </div>
                </div>
            </dialog>

            <div className="relative w-full h-full bg-fixed bg-center bg-cover">
                {/* <div className="absolute inset-0 bg-custom-main"></div> */}
                <img src={`${backgroundImage}?t=${timestamp}`} alt="bg" className="object-cover w-full h-full"></img>
                <div className="absolute inset-0 shadow-t-lg top-104 border-t-1 border-white/30 shadow-black/80 bg-gradient-to-b from-custom-main/40 via-45% via-custom-main/95 to-custom-main to-60% backdrop-blur-lg"></div>
                <div className="sticky inset-0 pointer-events-none bg-custom-main/90"></div>

                {/* <img alt="cover image" src={gameData['cover']} className="absolute z-10 object-cover w-56 h-auto transform border-2 right-16 lg:right-24 2xl:right-40 2xl:-bottom-60 -bottom-16 lg:-bottom-48 lg:w-64 2xl:w-80 border-primary"></img> */}

                {/* <div class="absolute right-16 lg:right-28 -bottom-16 lg:-bottom-40 transform w-56 h-72 lg:w-64 lg:h-96 bg-base-100 bg-opacity-15 z-20"></div> */}

                <div className='absolute flex flex-col w-full gap-7 top-112'>
                    <div className='flex flex-row justify-between'>
                        <div className='flex flex-col w-full gap-7'>
                            <div className="flex flex-row gap-2 text-4xl font-bold text-custom-text-light pl-14">
                                {gameData['chineseName'] ? `${gameData['chineseName']} ${gameData['name']}` : gameData['name']}
                            </div>
                            <div className='flex flex-row items-center gap-3 justify-items-center pl-14'>
                                <button className='text-lg transition-all border-0 shadow-sm w-52 btn bg-custom-green text-custom-text-light hover:brightness-110' onClick={handleStart}>
                                    <span className="icon-[mdi--play] w-7 h-7"></span>
                                    开始游戏
                                </button>
                                <div className='flex flex-row items-center pl-7 gap-7'>
                                    <div className='flex flex-row items-center gap-2 pl-2'>
                                        <span className="icon-[material-symbols--cloud] w-9 h-9"></span>
                                        <div className='flex flex-col items-start text-xs'>
                                            <div className='font-semibold'>云状态</div>
                                            <div className=' text-custom-text/80'>{
                                                config?.cloudSync?.enabled || false ? config['cloudSync']['mode'] === 'github' ? config['cloudSync']['github']['repoUrl'] ? '已是最新' : '未设置' : config['cloudSync']['mode'] === 'webdav' ? config['cloudSync']['webdav']['url'] ? '已是最新' : '未设置' : '未开启' : '未开启'
                                            }</div>
                                        </div>
                                    </div>
                                    <div className='flex flex-row items-center gap-2 pl-2'>
                                        <span className="icon-[fluent--calendar-48-filled] w-9 h-9"></span>
                                        <div className='flex flex-col items-start text-xs'>
                                            <div className='font-semibold'>最后运行日期</div>
                                            <div className=' text-custom-text/80'>{gameData['lastVisitDate'] ? gameData['lastVisitDate'].replace(/-/g, '.') : "还未运行过"}</div>
                                        </div>
                                    </div>
                                    {/* <div className='flex flex-col items-start pl-1 text-xs'>
                                        <div className='font-semibold'>最后运行日期</div>
                                        <div className=' text-custom-text/80'>2024年8月1日</div>
                                    </div> */}
                                    <div className='flex flex-row items-center gap-2 pl-2'>
                                        <span className="icon-[uil--clock] w-9 h-9"></span>
                                        <div className='flex flex-col items-start text-xs'>
                                            <div className='font-semibold'>游戏时间</div>
                                            <div className=' text-custom-text/80'>{formatTime(gameData['gameDuration'])}</div>
                                        </div>
                                    </div>
                                    <div className='flex flex-row items-center gap-2 pl-2'>
                                        <span className="icon-[typcn--flow-switch] w-9 h-8"></span>
                                        <div className='flex flex-col items-start text-xs'>
                                            <div className='font-semibold'>游戏状态</div>
                                            <div className=' text-custom-text/80'>{convertStatus(gameData['playStatus'])}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className='flex flex-row self-end gap-3 pr-6'>
                            <button className='min-h-0 border-0 shadow-sm w-9 h-9 btn btn-square text-custom-text-light bg-custom-text/40 hover:bg-custom-text/65 backdrop-blur-2xl' onClick={() => { document.getElementById('gameSetting').showModal() }}>
                                <span className="icon-[ic--sharp-settings] w-6 h-6"></span>
                            </button>
                            <div className="dropdown dropdown-end">
                                <div tabIndex={0} role="button" className="min-h-0 mb-1 border-0 w-9 h-9 btn btn-square text-custom-text-light bg-custom-text/40 hover:bg-custom-text/65 backdrop-blur-2xl">
                                    <span className="icon-[typcn--flow-switch] w-6 h-6"></span>
                                </div>
                                <ul tabIndex={0} className="dropdown-content menu bg-custom-main-5 rounded-box z-[1] w-52 p-2 shadow">
                                    <li onClick={() => { updateData([index, 'detail', 'playStatus'], 0) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>未开始</a></li>
                                    <li onClick={() => { updateData([index, 'detail', 'playStatus'], 1) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>游玩中</a></li>
                                    <li onClick={() => { updateData([index, 'detail', 'playStatus'], 2) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>已完成</a></li>
                                    <li onClick={() => { updateData([index, 'detail', 'playStatus'], 3) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>多周目</a></li>
                                </ul>
                            </div>
                            <div className="dropdown dropdown-end">
                                <div tabIndex={0} role="button" className="min-h-0 mb-1 border-0 w-9 h-9 btn btn-square text-custom-text-light bg-custom-text/40 hover:bg-custom-text/65 backdrop-blur-2xl">
                                    <span className="icon-[mingcute--more-1-fill] w-6 h-6"></span>
                                </div>
                                <ul tabIndex={0} className="dropdown-content menu bg-custom-main-5 rounded-box z-[1] w-52 p-2 shadow">
                                    <li onClick={() => { openFolderInExplorer(gameData['gamePath']) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>浏览本地文件</a></li>
                                    <li onClick={() => { openFolderInExplorer(gameData['savePath']) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>打开存档文件夹</a></li>
                                    <li onClick={() => { openFolderInExplorer(`/${gameData['id']}`) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>打开数据文件夹</a></li>
                                    <li onClick={() => { document.getElementById('deleteGame').showModal() }} className='hover:bg-custom-red'><a className='transition-none'>删除游戏</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col w-full pt-8">
                        <div role="tablist" className="pl-44 pr-44 tabs tabs-bordered">
                            <NavTab to="./detail" name="详情" />
                            <NavTab to="./character" name="角色" />
                            {/* <NavTab to="./2.5" name="版本" /> */}
                            <NavTab to="./save" name="存档" />
                            <NavTab to="./memory" name="回忆" />
                        </div>
                        <div className='flex pl-8 pr-8 pt-7 pb-7 grow-0'>
                            <Routes>
                                <Route index element={<Navigate to='./detail' />} />
                                <Route path='/detail' element={<Detail gameData={gameData} />} />
                                <Route path='/character' element={<Character characterData={characterData} />} />
                                <Route path='/save' element={<Save index={index} />} />
                                <Route path='/memory' element={<Memory index={index} />} />
                            </Routes>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    )
}

function Detail({ gameData }) {
    return (
        <div className='flex flex-row items-start w-full gap-5 grow-0'>
            <div className='flex flex-col w-2/3 gap-5 grow-0'>
                <div className='p-5 '>
                    <div className='font-bold text-custom-text-light'>游戏简介</div>
                    <div className='p-0 m-0 divider'></div>
                    <div className='pt-2 text-sm whitespace-pre-wrap'>
                        {gameData['introduction']}
                    </div>
                </div>
                <div className='p-5 '>
                    <div className='font-bold text-custom-text-light'>发行列表</div>
                    <div className='p-0 m-0 divider'></div>
                    <div className="flex flex-col gap-2 pt-2 text-sm">
                        {gameData['releases'].map((release, index) => {
                            return (
                                <a key={index} className='flex flex-row justify-between p-2 hover:bg-custom-blue-4/20 group' href={release['relatedLink']} target='_blank'>
                                    <div className='group-hover:text-custom-text-light'>
                                        <div className=''>{release['releaseName']}</div>
                                        <div className='text-xs'>发行时间：{release['releaseDate']}&nbsp;&nbsp;发行语言：{release['releaseLanguage']}</div>
                                    </div>
                                    <div className='flex gap-2'>
                                        <div className='transition-none badge-outline badge text-custom-blue-2 group-hover:brightness-150'>{release['platform']}</div>
                                        <div className={release['restrictionLevel'] === 'R18+' ? "transition-none badge-outline badge text-custom-red/50 group-hover:text-custom-red" : "transition-none badge-outline badge text-custom-green/50 group-hover:text-custom-green"}>{release['restrictionLevel']}</div>
                                    </div>
                                </a>
                            )
                        })}
                    </div>
                </div>
            </div>
            <div className='flex flex-col w-1/3 gap-5'>
                <div className='p-5 '>
                    <div className='font-bold text-custom-text-light'>作品信息</div>
                    <div className='p-0 m-0 divider'></div>
                    <div className='pt-2 text-sm'>
                        <div>原名：{gameData['name']}</div>
                        <div>中文名：{gameData['chineseName']}</div>
                        <div>发行日期：{gameData['releaseDate']}</div>
                        <div>会社：<a className='link link-hover' href={`https://www.ymgal.games/oa${gameData['developerId']}`} target='_blank'>{gameData['developer']}</a></div>
                        <div>类型：{gameData['typeDesc']}</div>
                    </div>
                </div>
                <div className='p-5 '>
                    <div className='font-bold text-custom-text-light'>相关网站</div>
                    <div className='p-0 m-0 divider'></div>
                    <div className="flex flex-col gap-1 pt-2 text-s">
                        {gameData['websites'].map((website, index) => {
                            return <a key={index} className='p-1 group bg-custom-blue-4/20 hover:brightness-125 hover:text-custom-text-light' href={website['url']} target='_blank'><div className='text-xs text-custom-blue-4 group-hover:text-custom-text-light' href={website['url']} target='_blank'>{website['title']}</div></a>
                        })}
                    </div>
                </div>
                <div className='p-5 '>
                    <div className='font-bold text-custom-text-light'>STAFF</div>
                    <div className='p-0 m-0 divider'></div>
                    <div className='pt-1 text-sm'>
                        {
                            Object.keys(gameData['staff']).map((key, index) => {
                                return (
                                    <div key={index}>
                                        <div>{key}：</div>
                                        {
                                            gameData['staff'][key].map((staff, index) => {
                                                return (
                                                    <div key={index}>&nbsp;▪<a className='link link-hover text-custom-blue-4/90' href={`https://www.ymgal.games/pa${staff['pid']}`} target='_blank'>{staff['name']}</a><span className='text-xs'>{staff['empDesc'] && `(${staff['empDesc']})`}</span></div>
                                                )
                                            })
                                        }
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}

function Character({ characterData }) {
    const { characterImage, updateCharacterImage } = useGameStore();

    return (
        <div className='flex flex-col w-full gap-5'>
            {characterData.map((character, index) => {
                return (
                    <div key={index}>
                        <div className='flex flex-row items-start gap-5'>
                            <div className='flex flex-row w-3/4 shadow-md bg-custom-main group'>
                                {character['cover'] && <img src={characterImage[index]} alt="c1" className="w-auto h-67"></img>}
                                <div className='flex flex-col h-67'>
                                    <div className='p-3 text-lg font-bold text-custom-text-light'>{character['chineseName'] ? character['chineseName'] : character['name']}</div>
                                    <div className='p-3 pt-0 overflow-auto text-sm scrollbar-base scrollbar-track-base-300'>{character['introduction']}</div>
                                </div>
                            </div>
                            <div className='flex flex-col w-1/4 gap-5 text-sm'>
                                <div className='p-5 shadow-md bg-custom-main'>
                                    <div className='pb-2 font-bold text-custom-text-light'>基本信息</div>
                                    <div>原名：{character['name']}</div>
                                    <div>中文名：{character['chineseName'] ? character['chineseName'] : "未知"}</div>
                                    <div>别名：{character['extensionName'][0] ? character['extensionName'].join('、') : "未知"}</div>
                                    <div>生日：{character['birthday'] ? character['birthday'] : "未知"}</div>
                                    <div>性别：{character['gender'] === 0 ? "未知" : character['gender'] === 1 ? "男" : character['gender'] === 2 ? "女" : "扶她"}</div>
                                </div>
                                <div className='p-5 shadow-md bg-custom-main'>
                                    <div className='pb-2 font-bold text-custom-text-light'>相关网站</div>
                                    <div className='flex flex-col gap-1'>
                                        {character['websites'].map((website, index) => {
                                            return <a key={index} className='p-1 group bg-custom-blue-4/20 hover:brightness-125 hover:text-custom-text' href={website['url']} target="_blank" rel="noreferrer"><div className='text-xs text-custom-blue-4 group-hover:text-custom-text'>{website['title']}</div></a>
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {index + 1 !== characterData.length && <div className='pt-6 divider'></div>}
                    </div>
                )
            })}
        </div>
    )
}

function Save({ index }) {
    const { data, setData, setAlert, updateData, timestamp } = useRootStore();
    async function switchSave(id) {
        try {
            window.electron.ipcRenderer.send('switch-save', data[index]['detail']['id'], id, data[index]['detail']['savePath']);
            setAlert('切换存档成功')
            setTimeout(() => { setAlert('') }, 3000)
        } catch (e) {
            setAlert('切换存档失败')
            setTimeout(() => { setAlert('') }, 3000)
        }
    }
    async function deleteSave(id) {
        try {
            window.electron.ipcRenderer.send('delete-save', data[index]['detail']['id'], id);
            updateData([index, 'saves'], data[index]['saves'].filter(save => save['id'] !== id))
            setAlert('删除存档成功')
            setTimeout(() => { setAlert('') }, 3000)
        }
        catch (e) {
            setAlert('删除存档失败')
            setTimeout(() => { setAlert('') }, 3000)
        }
    }
    return (
        <div className='w-full'>
            <div className="overflow-x-auto bg-custom-main">
                <table className="table">
                    {/* head */}
                    <thead>
                        <tr>
                            <th></th>
                            <th>存档时间</th>
                            <th className='w-1/2'>备注</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody className=''>
                        {/* row 1 */}
                        {
                            data[index]['saves'] ?
                                data[index]['saves'].map((save, i) => {
                                    return (
                                        <tr key={i}>
                                            <th>{i + 1}</th>
                                            <td>{save['date']}</td>
                                            <td>
                                                <input type="text" className='w-4/5 outline-none input-ghost input-sm input' value={save['note']} onChange={(e) => { updateData([index, 'saves', i, 'note'], e.target.value) }} />
                                            </td>
                                            <td>
                                                <div className='flex flex-row gap-2'>
                                                    <button className="h-6 min-h-0 text-xs font-thin border-0 btn bg-custom-blue-4/20 text-custom-text-light hover:brightness-125" onClick={() => { switchSave(save['id']) }}>切换</button>
                                                    {/* <button className="h-6 min-h-0 btn btn-accent">编辑</button> */}
                                                    <button className="h-6 min-h-0 text-xs font-thin border-0 btn bg-custom-blue-4/20 text-custom-text-light hover:bg-custom-red" onClick={() => { deleteSave(save['id']) }}>删除</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                }) :
                                <tr>
                                    <td>暂无存档</td>
                                </tr>
                        }

                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Memory({ index }) {
    const { data, setData, setAlert, updateData, timestamp, setTimestamp } = useRootStore();
    const [memoryImg, setMemoryImg] = useState('')
    const [memory, setMemory] = useState('')
    async function selectImgPath() {
        const path = await window.electron.ipcRenderer.invoke("open-img-dialog")
        if (path) {
            setMemoryImg(path)
        } else {
            return
        }
    }
    async function saveMemory() {
        try {
            const id = Date.now().toString()
            await window.electron.ipcRenderer.send('save-memory-img', data[index]['detail']['id'], id, memoryImg)
            updateData([index, 'memories'], [...data[index]['memories'], { id: id, imgPath: `/${data[index]['detail']['id']}/memories/${id}.webp`, note: memory }])
            document.getElementById('addMemory').close()
            setAlert('保存成功')
            setTimeout(() => { setAlert('') }, 3000)
            setTimeout(() => {
                setTimestamp()
            }, 500);
        } catch (e) {
            document.getElementById('addMemory').close()
            setAlert('保存失败')
            setTimeout(() => { setAlert('') }, 3000)
        }
    }
    function quitMemory() {
        setMemoryImg('')
        setMemory('')
        document.getElementById('addMemory').close()
    }
    return (
        <div className='flex flex-col w-full gap-7'>
            <dialog id="addMemory" className="modal">
                <div className="w-1/3 max-w-full max-h-full h-1/4 modal-box bg-custom-main-6">
                    <form method="dialog">
                        {/* if there is a button in form, it will close the modal */}
                        <button className="absolute btn btn-sm btn-ghost right-2 top-2">✕</button>
                    </form>
                    <div className='flex flex-col w-full h-full gap-3 p-5'>
                        <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/80 focus-within:hover:brightness-100">
                            <div className='font-semibold'>图片路径 |</div>
                            <input type='text' className='grow' value={memoryImg || ''} onChange={(e) => { setMemoryImg(e.target.value) }} />
                            <span className="icon-[material-symbols-light--folder-open-outline-sharp] w-5 h-5 self-center" onClick={selectImgPath}></span>
                        </label>
                        <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/80 focus-within:hover:brightness-100">
                            <div className='font-semibold'>文字 |</div>
                            <input type="text" name='gameName' className="grow" value={memory || ''} onChange={(e) => { setMemory(e.target.value) }} />
                        </label>
                        <div className='absolute flex flex-row gap-5 right-9 bottom-5'>
                            <button className='transition-all border-0 btn bg-custom-main-7 text-custom-text-light hover:brightness-125' onClick={saveMemory}>保存</button>
                            <button className='transition-all border-0 btn bg-custom-main-7 text-custom-text-light hover:brightness-125' onClick={quitMemory}>取消</button>
                        </div>
                    </div>
                </div>
            </dialog>

            <button className='border-0 btn bg-custom-blue-2/50 text-custom-text-light hover:brightness-125' onClick={() => { document.getElementById('addMemory').showModal() }}>添加</button>
            {data[index]['memories'] && data[index]['memories'].map((memory, index) => {
                return (
                    <div key={index} className='flex flex-col w-auto shadow-md'>
                        <img src={`${memory['imgPath']}?t=${timestamp}`} className='w-auto h-auto'></img>
                        <div className='p-3 bg-custom-blue-3/60'>{memory['note']}</div>
                    </div>
                )
            })}
        </div>
    )
}

const useGameSetting = create(set => ({
    activeTab: 'general',
    setActiveTab: (activeTab) => set({ activeTab }),
    settingData: {},
    setSettingData: (settingData) => set({ settingData }),
    updateSettiongData: (path, value) => set((state) => {
        const newData = JSON.parse(JSON.stringify(state.settingData));
        let current = newData;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return { settingData: newData };
    }),
    settingAlert: "",
    setSettingAlert: (settingAlert) => set({ settingAlert }),
    dataString: "",
    setDataString: (dataString) => set({ dataString }),
    isDataStringChanged: false,
    setIsDataStringChanged: (isDataStringChanged) => set({ isDataStringChanged }),
}))


function Setting({ index }) {
    const { activeTab, setActiveTab } = useGameSetting()
    const { updateData, data, setAlert, alert } = useRootStore()
    const { settingData, updateSettiongData, setSettingData, settingAlert, setSettingAlert, setDataString, dataString, isDataStringChanged, setIsDataStringChanged } = useGameSetting()
    useEffect(() => {
        setSettingData(data[index])
    }, [data, index])
    useEffect(() => {
        setDataString(JSON.stringify(settingData, null, 2))
    }, [settingData])
    function quitSetting() {
        setSettingData(data[index])
        document.getElementById('gameSetting').close()
    }
    async function saveSetting() {
        if (activeTab === 'advanced') {
            try {
                const newData = JSON.parse(dataString)
                updateData([index], newData)
                setSettingAlert('保存成功')
                setTimeout(() => { setSettingAlert('') }, 3000)
            } catch (error) {
                setSettingAlert('保存失败，请检查数据格式')
                setTimeout(() => { setSettingAlert('') }, 3000)
            }
            return
        } else if (activeTab === 'startup') {
            await window.electron.ipcRenderer.invoke('get-folder-size', settingData['detail']['gamePath']).then((data) => {
                updateData([index], settingData)
                updateData([index, 'detail', 'volume'], data)
                setSettingAlert('保存成功')
                setTimeout(() => { setSettingAlert('') }, 3000)
            })
            return
        }
        updateData([index], settingData)
        setSettingAlert('保存成功')
        setTimeout(() => { setSettingAlert('') }, 3000)
    }
    const tabs = ['general', 'advanced', 'media', 'startup'];
    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return <GeneralSettings index={index} />;
            case 'advanced':
                return <AdvancedSettings />;
            case 'media':
                return <MediaSettings />;
            case 'startup':
                return <StartupSettings />;
            default:
                return null;
        }
    };
    return (
        <div className='flex flex-col w-full h-full gap-5'>
            <div role="tablist" className="tabs tabs-bordered text-custom-text-light">
                {tabs.map((tab) => (
                    <a
                        key={tab}
                        role="tab"
                        className={`tab text-custom-text-light ${activeTab === tab ? 'tab-active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'general' ? '通用' :
                            tab === 'advanced' ? '高级' :
                                tab === 'media' ? '媒体' : '启动'}
                    </a>
                ))}
            </div>
            <div className='w-full h-full pb-20'>
                {renderContent()}
            </div>
            <div className='absolute flex flex-row gap-5 right-10 bottom-10'>
                <button className='transition-all btn bg-custom-main-7 text-custom-text-light hover:brightness-125' onClick={saveSetting}>保存</button>
                <button className='transition-all btn bg-custom-main-7 text-custom-text-light hover:brightness-125' onClick={quitSetting}>取消</button>
            </div>
            {settingAlert &&
                <div className="toast toast-center">
                    <div className="alert bg-custom-blue-6">
                        <span className='text-custom-text-light'>{settingAlert}</span>
                    </div>
                </div>
            }
        </div>
    )
}

function GeneralSettings({ index }) {
    const { updateData, data } = useRootStore()
    const { settingData, updateSettiongData, setSettingData } = useGameSetting()
    return (
        <div className='flex flex-col w-full h-full gap-3'>
            <div className='flex flex-row gap-3'>
                <div className='flex flex-col w-1/2 gap-3'>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                        <div className='font-semibold'>原名 |</div>
                        <input type="text" name='gameName' className="grow" value={settingData?.detail?.name || ''} onChange={(e) => { updateSettiongData(['detail', 'name'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>中文名 |</div>
                        <input type="text" name='gameChineseName' className="grow" value={settingData?.detail?.chineseName || ''} onChange={(e) => { updateSettiongData(['detail', 'chineseName'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>GID |</div>
                        <input type="text" name='gid' className="grow" value={settingData?.detail?.gid || ''} onChange={(e) => { updateSettiongData(['detail', 'gid'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>VID |</div>
                        <input type="text" name='vid' className="grow" value={settingData?.detail?.vid || ''} onChange={(e) => { updateSettiongData(['detail', 'vid'], e.target.value) }} />
                    </label>
                </div>
                <div className='flex flex-col w-1/2 gap-3'>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>发行日期 |</div>
                        <input type="text" name='releaseDate' className="grow" value={settingData?.detail?.releaseDate || ''} onChange={(e) => { updateSettiongData(['detail', 'releaseDate'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>开发者 |</div>
                        <input type="text" name='developer' className="grow" value={settingData?.detail?.developer || ''} onChange={(e) => { updateSettiongData(['detail', 'developer'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                        <div className='font-semibold'>类型 |</div>
                        <input type="text" name='typeDesc' className="grow" value={settingData?.detail?.typeDesc || ''} onChange={(e) => { updateSettiongData(['detail', 'typeDesc'], e.target.value) }} />
                    </label>
                    <div className="dropdown dropdown-end">
                        <div tabIndex={0} role="button" className="flex flex-row items-center justify-between w-full gap-2 mb-1 text-sm font-semibold border-0 input-sm bg-custom-main-7 hover:brightness-125">
                            <div className="flex items-center gap-2">
                                <div>限制级 |</div>
                                <div>{settingData?.detail?.restricted ? '是' : '否'}</div>
                            </div>
                            <span className="icon-[material-symbols-light--keyboard-arrow-down] w-6 h-6"></span>
                        </div>
                        <ul tabIndex={0} className="dropdown-content menu bg-custom-main-5 rounded-box z-[1] w-3/4 p-2 shadow">
                            <li onClick={() => { updateSettiongData(['detail', 'restricted'], true) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>是</a></li>
                            <li onClick={() => { updateSettiongData(['detail', 'restricted'], false) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>否</a></li>
                        </ul>
                    </div>
                </div>
            </div>
            <label className="flex flex-col items-start self-stretch h-full pt-2 outline-none grow bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/80">
                <div className='self-center text-sm font-semibold'>简介</div>
                <textarea spellCheck='false' className="self-stretch p-2 overflow-auto text-sm border-0 outline-none textarea textarea-ghost focus-within:text-custom-text-light/95 bg-custom-main-7 grow scrollbar-base focus:bg-custom-main-3" placeholder="Bio" value={settingData?.detail?.introduction || ''} onChange={(e) => { updateSettiongData(['detail', 'introduction'], e.target.value) }} />
            </label>
        </div>
    )
}

function AdvancedSettings() {
    const { settingData, updateSettiongData, setSettingData, dataString, setDataString } = useGameSetting()
    function formatTime(seconds) {
        if (seconds < 0) {
            return "无效时间";
        }

        if (seconds < 60) {
            return "小于一分钟";
        }

        const minutes = Math.floor(seconds / 60);
        const hours = minutes / 60;

        if (hours < 1) {
            return `${minutes}分钟`;
        } else {
            return `${hours.toFixed(1)}小时`;
        }
    }
    function playStatus(status) {
        switch (status) {
            case 0:
                return '未开始'
            case 1:
                return '游玩中'
            case 2:
                return '已完成'
            case 3:
                return '多周目'
            default:
                return '未知'
        }
    }
    return (
        <div className='flex flex-col w-full h-full gap-3'>
            <div className='flex flex-row gap-3'>
                <div className='flex flex-col w-1/2 gap-3'>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                        <div className='font-semibold'>添加日期 |</div>
                        <input type="text" name='addDate' className="grow" value={settingData?.detail?.addDate || ''} onChange={(e) => { updateSettiongData(['detail', 'addDate'], e.target.value) }} />
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                        <div className='font-semibold'>游玩时间 |</div>
                        <input type="text" name='gameDuration' className="grow" value={settingData?.detail?.gameDuration || ''} onChange={(e) => { updateSettiongData(['detail', 'gameDuration'], Number(e.target.value)) }} />
                        <div>{formatTime(settingData?.detail?.gameDuration || '')}</div>
                    </label>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                        <div className='font-semibold'>游玩次数 |</div>
                        <input type="text" name='frequency' className="grow" value={settingData?.detail?.frequency || '0'} onChange={(e) => { updateSettiongData(['detail', 'frequency'], Number(e.target.value)) }} />
                    </label>
                </div>
                <div className='flex flex-col w-1/2 gap-3'>
                    <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                        <div className='font-semibold'>数据库ID |</div>
                        <div>{(settingData?.detail?.gid || '').replace('ga', '')}</div>
                        {/* <input disabled type="text" name='gid' className="grow" value={settingData?.detail?.gid || ''} onChange={(e)=>{updateSettiongData(['detail', 'gid'], e.target.value)}} /> */}
                    </label>
                    <div className="dropdown dropdown-end">
                        <div tabIndex={0} role="button" className="flex flex-row items-center justify-between w-full gap-2 mb-1 text-sm font-semibold border-0 input-sm bg-custom-main-7 hover:brightness-125">
                            <div className="flex items-center gap-2">
                                <div>游玩状态 |</div>
                                <div>{playStatus(settingData?.detail?.playtStatus || 0)}</div>
                            </div>
                            <span className="icon-[material-symbols-light--keyboard-arrow-down] w-6 h-6"></span>
                        </div>
                        <ul tabIndex={0} className="dropdown-content menu bg-custom-main-5 rounded-box z-[1] w-3/4 p-2 shadow">
                            <li onClick={() => { updateSettiongData(['detail', 'playtStatus'], 0) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>未开始</a></li>
                            <li onClick={() => { updateSettiongData(['detail', 'playtStatus'], 1) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>游玩中</a></li>
                            <li onClick={() => { updateSettiongData(['detail', 'playtStatus'], 2) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>已完成</a></li>
                            <li onClick={() => { updateSettiongData(['detail', 'playtStatus'], 3) }} className='hover:bg-custom-text hover:text-black/80'><a className='transition-none'>多周目</a></li>
                        </ul>
                    </div>
                    <label className="flex items-center w-full gap-2 -mt-1 input-sm input focus-within:outline-none bg-custom-red text-custom-text-light/90">
                        <div className='font-semibold'>警告⚠️ |</div>
                        <div>随意修改数据库内容会导致程序崩溃！</div>
                        {/* <input disabled type="text" name='gid' className="grow" value={settingData?.detail?.gid || ''} onChange={(e)=>{updateSettiongData(['detail', 'gid'], e.target.value)}} /> */}
                    </label>
                </div>
            </div>
            <label className="flex flex-col items-start self-stretch h-full pt-2 outline-none grow bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:hover:brightness-100 focus-within:text-custom-text-light/95">
                <div className='self-center text-sm font-semibold'>数据库内容</div>
                <textarea spellCheck='false' className="self-stretch p-2 overflow-auto text-sm border-0 outline-none textarea textarea-ghost focus-within:text-custom-text-light/95 bg-custom-main-7 grow scrollbar-base focus:bg-custom-main-3" placeholder="Bio" value={dataString || ''} onChange={(e) => { setDataString(e.target.value) }} />
            </label>
        </div>
    )
}

function MediaSettings() {
    const { settingData, updateSettiongData, setSettingData, dataString, setDataString, setSettingAlert } = useGameSetting()
    const { coverImage, backgroundImage } = useGameStore()
    const { timestamp, setTimestamp } = useRootStore()
    async function updateCover(gameId) {
        try {
            // 打开文件选择对话框
            const selectedPath = await window.electron.ipcRenderer.invoke('open-img-dialog');

            if (selectedPath) {
                // 调用更新游戏封面的方法
                await window.electron.ipcRenderer.invoke('update-game-cover', gameId, selectedPath);

                // console.log('新的封面路径:', newCoverPath);

                // 这里可以添加更新UI或通知用户的逻辑
                setTimestamp()
                setSettingAlert('更换图片成功');
                setTimeout(() => { setSettingAlert('') }, 3000);
            } else {
                // 用户取消了选择
                console.log('用户取消了文件选择');
            }
        } catch (error) {
            console.error('更换图片时发生错误:', error);
            setSettingAlert('更换图片失败');
            setTimeout(() => { setSettingAlert('') }, 3000);
        }
    }
    async function updateBackgroundImage(gameId) {
        try {
            // 打开文件选择对话框
            const selectedPath = await window.electron.ipcRenderer.invoke('open-img-dialog');

            if (selectedPath) {
                // 调用更新游戏背景的方法
                await window.electron.ipcRenderer.invoke('update-game-background', gameId, selectedPath);

                // console.log('新的背景路径:', newCoverPath);

                // 这里可以添加更新UI或通知用户的逻辑
                setTimestamp()
                setSettingAlert('更换图片成功');
                setTimeout(() => { setSettingAlert('') }, 3000);
            } else {
                // 用户取消了选择
                console.log('用户取消了文件选择');
            }
        } catch (error) {
            console.error('更换图片时发生错误:', error);
            setSettingAlert('更换图片失败');
            setTimeout(() => { setSettingAlert('') }, 3000);
        }
    }
    return (
        <div className='flex flex-col w-full h-full gap-3'>
            <button className='transition-all btn btn-sm bg-custom-main-7 hover:brightness-125 text-custom-text-light' onClick={() => window.electron.ipcRenderer.send('open-folder', `src/renderer/public/${settingData?.detail?.id || ''}/`)}>打开媒体文件夹</button>
            <div className='flex flex-row gap-3 grow'>
                <div className='flex flex-col w-1/2 font-bold text-custom-text-light'>
                    <div>封面</div>
                    <div className='m-0 divider'></div>
                    <button className='transition-all btn btn-sm bg-custom-main-7 hover:brightness-125 text-custom-text-light' onClick={() => { updateCover(settingData?.detail?.id || '') }}>更换</button>
                    <img src={`${coverImage || ''}?t=${timestamp}`} alt="" className='w-1/2 h-auto pt-2' />
                </div>
                <div className='flex flex-col w-1/2 font-bold text-custom-text-light'>
                    <div>背景</div>
                    <div className='m-0 divider'></div>
                    <button className='transition-all btn btn-sm bg-custom-main-7 hover:brightness-125 text-custom-text-light' onClick={() => { updateBackgroundImage(settingData?.detail?.id || '') }}>更换</button>
                    <img src={`${backgroundImage || ''}?t=${timestamp}`} alt="" className='w-full h-auto pt-2' />
                </div>
            </div>
        </div>
    )
}

function StartupSettings() {
    const { settingData, updateSettiongData, setSettingData, setSettingAlert } = useGameSetting()
    async function selectGamePath() {
        const path = await window.electron.ipcRenderer.invoke("open-file-dialog")
        if (path) {
            updateSettiongData(['detail', 'gamePath'], path)
        } else {
            return
        }
    }

    async function selectSavePath() {
        const path = await window.electron.ipcRenderer.invoke("open-file-folder-dialog")
        if (path) {
            updateSettiongData(['detail', 'savePath'], path)
        } else {
            return
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
    }

    function getGamePathByDrag(e) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 1) {
            setSettingAlert('只能选择一个路径');
            setTimeout(() => { setSettingAlert(''); }, 3000);
            return
        }
        const file = files[0];
        const fileExtension = file.name.split('.').pop();
        if (fileExtension !== 'exe') {
            setSettingAlert('请选择可执行文件');
            setTimeout(() => { setSettingAlert(''); }, 3000);
            return
        }
        updateSettiongData(['detail', 'gamePath'], file.path)
    }

    function getSavePathByDrag(e) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 1) {
            setSettingAlert('只能选择一个路径');
            setTimeout(() => { setSettingAlert(''); }, 3000);
            return
        }
        updateSettiongData(['detail', 'savePath'], files[0].path)
    }
    return (
        <div className='flex flex-col w-full h-full gap-3'>
            <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                <div className='font-semibold'>游戏路径 |</div>
                <input type='text' placeholder='拖拽获取路径' onDrop={getGamePathByDrag} onDragOver={handleDragOver} className='grow' value={settingData?.detail?.gamePath || '0'} onChange={(e) => { updateSettiongData(['detail', 'gamePath'], e.target.value) }} />
                <span className="icon-[material-symbols-light--folder-open-outline-sharp] w-5 h-5 self-center" onClick={selectGamePath}></span>
            </label>
            <label className="flex items-center w-full gap-2 border-0 input-sm input bg-custom-main-7 focus-within:outline-none hover:brightness-125 focus-within:border-0 focus-within:shadow-inner-sm focus-within:shadow-black focus-within:bg-custom-main-3 focus-within:text-custom-text-light/95 focus-within:hover:brightness-100">
                <div className='font-semibold'>存档路径 |</div>
                <input type='text' placeholder='拖拽获取路径' onDrop={getSavePathByDrag} onDragOver={handleDragOver} className='grow' value={settingData?.detail?.savePath || '0'} onChange={(e) => { updateSettiongData(['detail', 'savePath'], e.target.value) }} />
                <span className="icon-[material-symbols-light--folder-open-outline-sharp] w-5 h-5 self-center" onClick={selectSavePath}></span>
            </label>
        </div>
    )
}

export default Game