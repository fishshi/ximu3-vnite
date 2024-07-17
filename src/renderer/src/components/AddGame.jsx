import { useStore, create } from 'zustand';
import { MemoryRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

const useAddGame = create(set => ({
    gameName: '',
    gid: '',
    vid: '',
    alert: '',
    gameList: [],
    isLoading: false,
    gamePath: '',
    savePath: '',
    gameBgList: [],
    gameBg: '',
    setGameName: (gameName) => set({gameName}),
    setGID: (gid) => set({gid}),
    setVID: (vid) => set({vid}),
    setAlert: (alert) => set({alert}),
    setGameList: (gameList) => set({gameList}),
    setIsLoading: (isLoading) => set({isLoading}),
    setGamePath: (gamePath) => set({gamePath}),
    setSavePath: (savePath) => set({savePath}),
    setGameBgList: (gameBgList) => set({gameBgList}),
    setGameBg: (gameBg) => set({gameBg})
}));



function AddGame() {
  const {alert, setGameName, setGameList, setGID, setVID} = useAddGame();
  let navigate = useNavigate();
  function quit(){
    setTimeout(() => {
      setGameName('');
      setGID('');
      setVID('');
      setGameList([]);
      navigate('/info');
    }, 1000);
  }
  return(
    <dialog id="my_modal_3" className="modal">
        <div className="w-auto h-auto max-w-full max-h-full modal-box">
          <form method="dialog">
            {/* if there is a button in form, it will close the modal */}
            <button className="absolute btn btn-sm btn-ghost right-2 top-2" onClick={quit}>✕</button>
          </form>
            <div className='w-full h-full p-6 pl-10 pr-10'>
              <Routes>
                <Route index element={<Navigate to={'/info'} />} />
                <Route path='/info' element={<Info />} />
                <Route path='/list' element={<GameList />} />
                <Route path='/path' element={<GamePath />} />
                <Route path='/bg' element={<GameBg />} />
              </Routes>
            </div>
            {alert && 
              <div className="toast toast-center">
                <div className="alert alert-error">
                  <span className='text-base-100'>{alert}</span>
                </div>
              </div>
            }
        </div>
      </dialog>
  )
}

function Info() {
  let navigate = useNavigate();
    const {gameName, gid, vid, setGameName, setGID, setVID, setAlert, setGameList, isLoading, setIsLoading} = useAddGame();
    async function submitInfo () {
      if(gameName === '') {
        setAlert('请填写游戏原名!');
        setTimeout(() => {setAlert('');}, 3000);
        return
      }
      setIsLoading(true);
      const gameList = await window.api.searchGameList(gameName)
      setGameList(gameList["data"]["result"]);
      navigate('/list');
      setIsLoading(false);
    }
    return(
        <div className='w-full h-full'>
            <div className='pb-5 text-2xl font-bold text-center'>基本信息</div>
            <div className='flex flex-col gap-5'>
                <label className="flex items-center h-10 gap-2 input input-bordered input-primary focus-within:outline-none focus-within:border-primary focus-within:border-2">
                <div className='font-semibold'>游戏名 |</div>
                <input type="text" name='gameName' className="grow" placeholder="推荐使用原名，请准确填写" value={gameName} onChange={(e)=>{setGameName(e.target.value)}} />
                </label>
                <label className="flex items-center h-10 gap-2 input input-bordered input-primary focus-within:outline-none focus-within:border-primary focus-within:border-2">
                <div className='font-semibold'>GID |</div>
                <input type="text" name='gid' className="grow" placeholder="月幕Galgame档案id，不带GA" value={gid} onChange={(e)=>{setGID(e.target.value)}} />
                <span className="badge badge-info">可选</span>
                </label>
                <label className="flex items-center h-10 gap-2 input input-bordered input-primary focus-within:outline-none focus-within:border-primary focus-within:border-2">
                <div className='font-semibold'>VID |</div>
                <input type="text" name='vid' className="grow" placeholder="VNDB档案id，不带v" value={vid} onChange={(e)=>{setVID(e.target.value)}} />
                <span className="badge badge-info">可选</span>
                </label>
                <div className='pt-1'>填写&nbsp;<span className='bg-info'> GID </span>&nbsp;和&nbsp;<span className='bg-info'> VNDB ID </span>&nbsp;项可大幅提高识别正确率。</div>
            </div>
            <button className='w-full h-10 mt-9 btn btn-primary text-base-100' onClick={submitInfo}>
              {isLoading && <span className='loading loading-spinner'></span>}
              识别
            </button>
        </div>
    )
}

function GameList(){
  let navigate = useNavigate();
  const {gid, gameList, setGID, setGameName} = useAddGame();
  return(
    <div className='flex flex-col w-full h-full gap-5'>
      <div className='pb-3 text-2xl font-bold text-center'>识别结果</div>
      <div className='overflow-x-auto h-100 scrollbar-base'>
        <table className="table bg-base-300 table-pin-rows">
          <thead className='bg-primary'>
            <tr className='bg-secondary'>
              <th>中文名</th>
              <th>原名</th>
              <th>GID</th>
              <th>发行时间</th>
              <th>开发商</th>
              <th>汉化</th>
            </tr>
          </thead>
          <tbody>
            {
              gameList.map((gameData, index) => {
                return (
                  <tr className={gid === gameData["id"] ? "bg-success" : "bg-base-300"} key={index} onClick={()=>{
                    setGID(gameData["id"])
                    setGameName(gameData["name"])
                  }}>
                    <td>{gameData["chineseName"] ? gameData["chineseName"] : "无"}</td>
                    <td>{gameData["name"]}</td>
                    <td>{gameData["id"]}</td>
                    <td>{gameData["chineseName"]}</td>
                    <td>{gameData["orgName"]}</td>
                    <td>{gameData["haveChinese"] ? "有" : "无"}</td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>
      <div className='flex flex-row-reverse items-end gap-5 pt-3'>
        <button className='btn btn-primary text-base-100' onClick={()=>{navigate('/path')}}>下一步</button>
        <button className='btn btn-primary text-base-100' onClick={()=>{navigate(-1)}}>上一步</button>
      </div>
    </div>
  )
}

function GamePath(){
  const {gamePath, savePath, gameName, setGamePath, setSavePath, setAlert, setIsLoading, setGameBgList} = useAddGame();
  let navigate = useNavigate();

  async function selectGamePath(){
    const path = await window.electron.ipcRenderer.invoke("open-file-dialog")
    setGamePath(path);
  }

  async function selectSavePath(){
    const path = await window.electron.ipcRenderer.invoke("open-file-folder-dialog")
    setSavePath(path);
  }

  function handleDragOver(e){
    e.preventDefault();
  }

  function getGamePathByDrag(e){
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if(files.length > 1){
      setAlert('只能选择一个路径');
      setTimeout(() => {setAlert('');}, 3000);
      return
    }
    const file = files[0];
    const fileExtension = file.name.split('.').pop();
    if(fileExtension !== 'exe'){
      setAlert('请选择可执行文件');
      setTimeout(() => {setAlert('');}, 3000);
      return
    }
    setGamePath(file.path);
  }

  function getSavePathByDrag(e){
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if(files.length > 1){
      setAlert('只能选择一个路径');
      setTimeout(() => {setAlert('');}, 3000);
      return
    }
    setSavePath(files[0].path);
  }

  async function submitGamePath(){
    if(gamePath === '' || gamePath === undefined){
      setAlert('请填写游戏路径');
      setTimeout(() => {setAlert('')}, 3000);
      return
    }
    if(savePath === '' || savePath === undefined){
      setAlert('请填写存档路径');
      setTimeout(() => {setAlert('')}, 3000);
      return
    }
    setIsLoading(true);
    const gameBgList = await window.api.getScreenshotsByTitle(gameName);
    setGameBgList(gameBgList);
    navigate('/bg');
    setIsLoading(false);
  }

  return(
    <div className='flex flex-col w-full h-full gap-5'>
      <div className='pb-3 text-2xl font-bold text-center'>选择路径</div>
      <div className='join'>
        <button className='btn btn-primary text-base-100 no-animation' onClick={selectGamePath}>选择游戏路径</button>
        <input type='text' placeholder='拖拽获取路径' onDrop={getGamePathByDrag} onDragOver={handleDragOver} className='input input-bordered input-primary focus-within:outline-none focus-within:border-primary' value={gamePath} onChange={(e)=>{setGamePath(e.target.value)}} />
      </div>
      <div className='join'>
        <button className='btn btn-primary text-base-100 no-animation' onClick={selectSavePath}>选择存档路径</button>
        <input type='text' placeholder='拖拽获取路径' onDrop={getSavePathByDrag} onDragOver={handleDragOver} className='input input-bordered input-primary focus-within:outline-none focus-within:border-primary' value={savePath} onChange={(e)=>{setSavePath(e.target.value)}} />
      </div>
      <div className='flex flex-row-reverse items-end gap-5 pt-3'>
        <button className='btn btn-primary text-base-100' onClick={submitGamePath}>下一步</button>
        <button className='btn btn-primary text-base-100' onClick={()=>{navigate(-1)}}>上一步</button>
      </div>
    </div>
  )
}

function GameBg(){
  const {gameBgList, setGameBg, gameBg} = useAddGame();
  let navigate = useNavigate();
  return(
    <div className='h-full w-270'>
      <div className='pb-5 text-2xl font-bold text-center'>选择背景图</div>
      <div className='overflow-x-auto h-120 scrollbar-base'>
        <div className='flex flex-wrap gap-3'>
          {
            gameBgList.map((bg, index) => {
              return(
                <div key={index} className={gameBg === bg ? 'w-86 p-3 bg-success' : 'w-86 p-3 bg-base-300'} onClick={()=>{setGameBg(bg)}}>
                  <img src={bg} alt={index} className='w-full h-auto' />
                </div>
              )
            })
          }
        </div>
      </div>
      <div className='flex flex-row-reverse items-end gap-5 pt-5'>
        <button className='btn btn-primary text-base-100' onClick={()=>{navigate('/list')}}>确定</button>
        <button className='btn btn-primary text-base-100' onClick={()=>{navigate(-1)}}>上一步</button>
      </div>
    </div>
  )
}

export default AddGame