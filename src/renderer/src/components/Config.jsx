import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { create } from 'zustand';
import { useRootStore } from './Root'
import { useEffect, useState } from 'react'


function NavButton({ to, name }) {
  return (
    <NavLink className={({ isActive, isPending }) =>
      isPending
        ? ""
        : isActive
        ? "bg-primary text-base-100"
        : ""
    }
    to={to}>
      {name}
    </NavLink>
  )

}

const useConfigStore = create(set => ({
    configSetting: {},
    configAlert: "",
    setConfigSetting: (configSetting) => set({ configSetting }),
    updateConfigSetting: (path, value) => set((state) => {
        const newConfigSetting = JSON.parse(JSON.stringify(state.configSetting));
        let current = newConfigSetting;
        for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return { configSetting: newConfigSetting };
    }),
    setConfigAlert: (configAlert) => set({ configAlert }),
}));

function Config() {
    const { config, setConfig, updateConfig } = useRootStore();
    const { configSetting, setConfigSetting, configAlert, updateConfigSetting } = useConfigStore();
    const keyToName = {
        cloudSync: "云同步",
    };
    useEffect(() => {
        setConfigSetting(config);
    }, [config]);
    function saveConfig() {
        if(configSetting.cloudSync.webdav.path.endsWith('/my-gal')){
            setConfig(configSetting);
        }else{
            setConfig(configSetting);
            updateConfig(['cloudSync', 'webdav', 'path'], config.cloudSync.webdav.path + '/my-gal');
        }
    }
    function quit() {
        setConfigSetting(config);
    }
    return (
        <dialog id="my_modal_0" className="modal">
            <div className="w-1/2 max-w-full max-h-full p-0 h-5/6 modal-box">
                <form method="dialog">
                    {/* if there is a button in form, it will close the modal */}
                    <button className="absolute btn btn-sm btn-ghost right-2 top-2" onClick={quit}>✕</button>
                </form>


                <div className="flex flex-row w-full h-full">
                    <div className="flex flex-col h-full p-3 w-52 bg-base-300 shrink-0">
                        <div className="w-full grow">
                            <div className='pt-2 pb-2 pl-4 text-xl font-bold'>设置</div>
                            <ul className="w-full menu rounded-box">
                                {
                                    Object.keys(config).map(key => (
                                        <li key={key}>
                                            <NavButton to={`./${key}`} name={keyToName[key]} />
                                        </li>
                                    ))
                                }
                            </ul>
                            
                        </div>
                    </div>
                    <div className="grow">
                        <Routes>
                            <Route index element={<Navigate to='./cloudSync' />} />
                                {
                                    Object.keys(config).map(key => (
                                        <Route key={key} path={`/${key}/*`} element={<CloudSync />} />
                                    ))
                                }
                        </Routes>
                        <div className='absolute flex flex-row gap-3 right-5 bottom-5'>
                            <button className="btn btn-success" onClick={saveConfig}>保存</button>
                            <button className="btn btn-error" onClick={quit}>取消</button>
                        </div>
                    </div>
                    {
                        configAlert &&
                            <div className="toast toast-center">
                                <div className="alert alert-error">
                                    <span className='text-base-100'>{configAlert}</span>
                                </div>
                            </div>
                    }
                </div>


            </div>
        </dialog>
    );
}


function CloudSync(){
    const { configSetting, updateConfigSetting, setConfigAlert } = useConfigStore();
    const { updateConfig, config } = useRootStore();
    async function loginGithub() {
        window.electron.ipcRenderer.invoke('start-auth-process', configSetting.cloudSync.github.clientId, configSetting.cloudSync.github.clientSecret).then((data) => {
            updateConfig(['cloudSync', 'github', 'username'], data.username);
            updateConfig(['cloudSync', 'github', 'accessToken'], data.accessToken);
        })
        window.electron.ipcRenderer.on('auth-error', (event, message) => {
            setConfigAlert('Github登录失败：' + message);
            setTimeout(() => {
                setConfigAlert('');
            }, 5000);
        })
        window.electron.ipcRenderer.on('auth-success', (event, data) => {
            setConfigAlert('Github登录成功：' + data.username);
            setTimeout(() => {
                setConfigAlert('');
            }, 5000);
            window.electron.ipcRenderer.invoke('initialize-repo', data.accessToken, data.username).then((data) => {
                if (data) {
                    setConfigAlert('Github仓库初始化成功');
                    setTimeout(() => {
                        setConfigAlert('');
                    }, 5000);
                    updateConfig(['cloudSync', 'github', 'repoUrl'], data);
                    updateConfig(['cloudSync', 'github', 'lastSyncTime'], getFormattedDateTimeWithSeconds());
                }
            })
        })
        window.electron.ipcRenderer.on('initialize-error', (event, message) => {
            setConfigAlert('Github仓库初始化失败：' + message);
            setTimeout(() => {
                setConfigAlert('');
            }, 5000);
        })
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
    function githubSync() {
        const time = getFormattedDateTimeWithSeconds();
        window.electron.ipcRenderer.invoke('cloud-sync-github', time).then((data) => {
            if (data === 'success') {
                setConfigAlert('Github同步成功');
                updateConfig(['cloudSync', 'github', 'lastSyncTime'], time);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            } else {
                setConfigAlert('Github同步失败：' + data);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            }
        })
    }
    function webdavUpload() {
        const time = getFormattedDateTimeWithSeconds();
        window.electron.ipcRenderer.invoke('cloud-sync-webdav-upload', config['cloudSync']['webdav']['url'], config['cloudSync']['webdav']['username'], config['cloudSync']['webdav']['password'], config['cloudSync']['webdav']['path']).then((data) => {
            if (data === 'success') {
                setConfigAlert('WebDav上传成功');
                updateConfig(['cloudSync', 'webdav', 'lastSyncTime'], time);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            } else {
                setConfigAlert('WebDav上传失败：' + data);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            }
        })
    }

    function webdavDownload() {
        const time = getFormattedDateTimeWithSeconds();
        window.electron.ipcRenderer.invoke('cloud-sync-webdav-download', config['cloudSync']['webdav']['url'], config['cloudSync']['webdav']['username'], config['cloudSync']['webdav']['password'], config['cloudSync']['webdav']['path']).then((data) => {
            if (data === 'success') {
                setConfigAlert('WebDav下载成功');
                updateConfig(['cloudSync', 'webdav', 'lastSyncTime'], time);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            } else {
                setConfigAlert('WebDav下载失败：' + data);
                setTimeout(() => {
                    setConfigAlert('');
                }, 3000);
            }
        })
    }
    return (
        <div className='flex flex-col w-full h-full gap-5 pb-32 overflow-auto p-7 scrollbar-base'>
            <div className='text-2xl font-bold'>云同步</div>
            <div className='flex flex-col gap-2'>
                <label className="p-0 cursor-pointer label">
                    <span className="text-sm font-semibold">是否开启</span>
                    <input type="checkbox" className="toggle" checked={configSetting?.cloudSync?.enabled || false} onChange={(e)=>{updateConfigSetting(['cloudSync', 'enabled'], e.target.checked)}} />
                </label>
                <div className='m-0 divider'></div>
                <label className="flex p-0 label">
                    <span className="flex-grow text-sm font-semibold">同步模式</span>
                    <select className="w-full outline-none bg-base-100 select select-bordered select-sm max-w-32" value={configSetting?.cloudSync?.mode || 'github'} onChange={(e)=>{updateConfigSetting(['cloudSync', 'mode'], e.target.value)}}>
                        <option value={'github'}>Github</option>
                        <option value={'webdav'}>WebDav</option>
                    </select>
                </label>
            </div>
            <div className='flex flex-col gap-2'>
                <div className='flex flex-row gap-2 pb-2 font-bold'>Github<div className="self-center badge badge-secondary badge-outline badge-sm">推荐</div></div>
                {
                    config['cloudSync']['github']['username'] ?
                        <div>
                            <div className='flex flex-row items-center'>
                                <span className="text-sm font-semibold grow">账号</span>
                                <span className="p-1 text-sm font-semibold bg-base-300">{config['cloudSync']['github']['username']}</span>
                            </div>
                            <div className='m-0 divider'></div>
                            <div className='flex flex-row items-center'>
                                <span className="text-sm font-semibold grow">仓库</span>
                                <a className="p-1 text-sm font-semibold link-hover" href={config['cloudSync']['github']['repoUrl']} target='_blank'>{`${config['cloudSync']['github']['username']}/my-gal`}</a>
                            </div>
                            <div className='m-0 divider'></div>
                            <div className='flex flex-row items-center gap-2'>
                                <span className="text-sm font-semibold grow">最后同步时间</span>
                                <span className="p-1 text-sm font-semibold">{config['cloudSync']['github']['lastSyncTime']}</span>
                                <button className='btn btn-xs' onClick={githubSync}>同步</button>
                            </div>
                        </div>
                    :
                        <div className='flex flex-row'>
                            <span className="text-sm font-semibold grow">账号</span>
                            <button className='self-center btn-sm btn btn-secondary' onClick={loginGithub}>登录</button>
                        </div>
                }
            </div>
            <div className='flex flex-col gap-2'>
                <div className='pb-2 font-bold'>WebDav</div>
                <div className='flex flex-row items-center'>
                    <span className="text-sm font-semibold grow">地址</span>
                    <input className="w-1/2 min-h-0 outline-none input input-bordered input-sm" spellCheck='false' placeholder='示例：https://pan.example.xyz' value={configSetting?.cloudSync?.webdav?.url || ''} onChange={(e)=>{updateConfigSetting(['cloudSync', 'webdav', 'url'], e.target.value)}} />
                </div>
                <div className='m-0 divider'></div>
                <div className='flex flex-row items-center'>
                    <span className="text-sm font-semibold grow">路径</span>
                    <input className="w-1/2 min-h-0 outline-none input input-bordered input-sm" spellCheck='false' placeholder='示例：/dav/my-gal' value={configSetting?.cloudSync?.webdav?.path || ''} onChange={(e)=>{updateConfigSetting(['cloudSync', 'webdav', 'path'], e.target.value)}} />
                </div>
                <div className='m-0 divider'></div>
                <div className='flex flex-row items-center'>
                    <span className="text-sm font-semibold grow">用户名</span>
                    <input className="w-1/3 min-h-0 outline-none input input-bordered input-sm" spellCheck='false' value={configSetting?.cloudSync?.webdav?.username || ''} onChange={(e)=>{updateConfigSetting(['cloudSync', 'webdav', 'username'], e.target.value)}} />
                </div>
                <div className='m-0 divider'></div>
                <div className='flex flex-row items-center'>
                    <span className="text-sm font-semibold grow">密码</span>
                    <input className="w-1/3 min-h-0 outline-none input input-bordered input-sm" spellCheck='false' value={configSetting?.cloudSync?.webdav?.password || ''} onChange={(e)=>{updateConfigSetting(['cloudSync', 'webdav', 'password'], e.target.value)}} />
                </div>
                <div className='m-0 divider'></div>
                <div className='flex flex-row items-center gap-2'>
                    <span className="text-sm font-semibold grow">最后同步时间</span>
                    <span className="p-1 text-sm font-semibold">{config['cloudSync']['webdav']['lastSyncTime']}</span>
                    <button className='btn btn-xs' onClick={webdavUpload}>上传</button>
                    <button className='btn btn-xs' onClick={webdavDownload}>下载</button>
                </div>
            </div>
        </div>
    );
}

export default Config;