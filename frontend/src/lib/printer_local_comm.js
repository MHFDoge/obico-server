import { toMomentOrNull } from '@src/lib/normalizers'
import filesize from 'filesize'
import _ from 'lodash'

export function listPrinterLocalGCodesOctoPrint(printerComm, path, searchKeyword) {
  return new Promise((resolve, reject) => {
    let kwargs;
    if (searchKeyword) {
      // In OctoPrint we can do global search for better user experience. Hence path is ignored
      kwargs = {filter: String(searchKeyword), recursive: true};
    } else {
      kwargs = {path: path, recursive: false, level: 1}; // Return 1 level children so that we can do item count
    }

    printerComm.passThruToPrinter({
      func: 'list_files',
      target: '_file_manager',
      kwargs,
    },
    (err, ret) => {
      if (err || ret?.error) {
        reject(err || ret?.error || 'Something went wrong!');
      }

      let folders = []
      let files = []

      if (!ret?.local || !Object.keys(ret.local).length) {
        resolve()
        return
      }

      // ObicoUpload is used to cache Obico Cloud files and should be hidden from the users
      delete ret.local.ObicoUpload

      const items = searchKeyword ? listRecoursively(ret.local) : Object.values(ret.local)
      for (const item of items) {
        if (item.type === 'folder') {
          folders.push({
            id: item.path,
            path: item.path,
            name: item.display,
            numItems: Object.keys(item.children).length,
          })
        } else {
          files.push({
            ...item,
            id: item.path,
            filename: item.name,
            num_bytes: item.size,
            filesize: filesize(item.size),
            created_at: toMomentOrNull(new Date(item.date * 1000)),
          })
        }
      }
      resolve({ folders, files })
    })
  })
}

export function listPrinterLocalGCodesMoonraker(printerComm, path, searchKeyword) {
  return new Promise((resolve, reject) => {
    printerComm.passThruToPrinter(
      {
        target: 'moonraker_api',
        func: 'server/files/directory',
        kwargs: {
          path,
          extended: true,
        },
      },
      (err, ret) => {
        if (err || ret?.error) {
          reject(err || ret?.error || 'Something went wrong!');
        }
        // subdirs should be ignored when user is searching
        const dirsInServerFormat = searchKeyword
          ? []
          : _.map(
              _.filter(
                _.get(ret, 'dirs', []),
                (d) => !d.dirname.startsWith('.') && !d.dirname.startsWith('Obico_Upload')
              ),
              (d) => {
                return {
                  name: d.dirname,
                  path: `${path}/${d.dirname}`,
                  children: [], // To signify this is a folder, not a file
                }
              }
            )

        const filesInServerFormat = _.map(
          _.filter(
            _.get(ret, 'files', []),
            (f) =>
              !f.filename.startsWith('.') &&
              (!searchKeyword || f.filename.toLowerCase().includes(searchKeyword.toLowerCase()))
          ),
          (f) => {
            return {
              ...f,
              num_bytes: f.size,
              created_at: new Date(f.modified * 1000),
              path: `${path}/${f.filename}`,
            }
          }
        )
        resolve({ folders: dirsInServerFormat, files: filesInServerFormat })
      }
    )
  })
}

const listRecoursively = (fileObj) => {
  const fileList = []
  for (const item of Object.values(fileObj)) {
    if (item.children) {
      fileList.push(...listRecoursively(item.children))
    } else {
      fileList.push(item)
    }
  }
  return fileList
}
