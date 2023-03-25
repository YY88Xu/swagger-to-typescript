import type { ConvertItem, IntegratedType, GlobalFileTag, Tags, Paths, VoProp, Vo, SwaggerDocType, } from './swaggerType'

import axios, { AxiosResponse } from 'axios'
import fs from 'fs'

const convertTypeMap = {
  'number': 'number',
  'integer': 'number',
  'string': 'string',
  'object': 'object',
  'boolean': 'boolean'
}

let globalTags: GlobalFileTag[];

const handleRefType = (str: string): string | undefined => str.split('/')?.pop()?.replace('«', '')?.replace('»', '')

const getType = (typeObj?: IntegratedType | VoProp): string|undefined => {
  if(typeObj?.type){
    const typeTmp = convertTypeMap[typeObj.type as keyof typeof convertTypeMap]
    if(typeTmp===undefined && typeObj.type === 'array'){
      return getArrayType(typeObj)
    }else{
      return typeTmp
    }
  } else if(typeObj?.$ref){
    return handleRefType(typeObj?.$ref)
  }
  return undefined
}

const getArrayType = (detail: IntegratedType | VoProp) => {
  const typeRes = getType(detail.items)
  if(typeRes){
    return `${typeRes}[]`
  }else{
    return undefined
  }
}

const getDefinitionType = (prop: string, definition: Vo) => {
  const cleanProp = prop.replace('«', '').replace('»', '')
  let types = `export interface ${cleanProp} {\n`
  const properties = definition.properties
  for(let p in properties){
    const detail = properties[p]
    const cur = getType(detail)

    if(detail.description){
      types += `  /** ${detail.description} */\n`
      types += `  ${p}?: ${cur}\n\n`
    }else{
      types += `  ${p}?: ${cur}\n`
    }

  }
  types += `}\n\n`
  return types
}

const capitalizedWord = (word: string):string => word.charAt(0).toUpperCase() + word.slice(1)

const lowerWord = (word: string):string => word.charAt(0).toLowerCase() + word.slice(1)

// /alert/detail/{id}   /alert/list
const getServiceName = (path: string, fetchMethod: string='')=>{
  const plist = path.split('/').filter(item=>item)
  plist.push('by')
  plist.push(fetchMethod)

  return plist.map((item, index) => {
    if(item.indexOf('{')>=0){
      // 去掉{}
      item = item.slice(1, item.length-1)
    }
    if(index===0){
      return item
    }else{
      return capitalizedWord(item)
    }
  }).join('')
}

const getParamsStr = (queryParams: ConvertItem[])=>{
  let paramsStr = ''
  queryParams.forEach((item, index)=>{
    if(index===0){
      paramsStr = '{ '
    }
    paramsStr += `${item.name}${item.required ? '' : '?'}: ${item.type}; `
    if(index===queryParams.length-1){
      paramsStr += '}'
    }
  })
  return paramsStr
}

const handlePathParams = (queryParams: ConvertItem[])=>{
  let paramsStr = ''
  queryParams.forEach((item, index)=>{
    if(index===0){
      paramsStr = ' '
    }
    paramsStr += `${item.name}${item.required ? '' : '?'}: ${item.type},`
  })
  return paramsStr
}

const convertPath = (path: string) => {
  return path.split('/').map(item=>{
    if(item.indexOf('{')>=0){
      return `$${item}`
    }
    return item
  }).join('/')
}

const getImportStr = (importType: string[]) => {
  let str = `import axios from 'axios'\n\n`
  importType.forEach((item, index)=>{
    if(index===0){
      str += `import { `
    }
    str += `${item}, `
    if(index===importType.length-1){
      str += `} from './newTypes'\n\n`
    }
  })
  return str
}

const handleService = (basePath: string, paths: Paths)=>{
  for(let prop in paths){
    const content = paths[prop]
    const methodsArr = Object.keys(content)

    for(let fetchMethod of methodsArr){
      const serviceName = getServiceName(prop, fetchMethod)

      const methodValueObj = content[fetchMethod!]
  
      const curTag = methodValueObj?.tags?.pop()
      const tagInfo = globalTags.find(item => item.name === curTag)
  
      let serviceStr = tagInfo?.serviceStr
      serviceStr += `/**\n* @description ${methodValueObj.description}\n* @tags ${curTag}\n* @request ${fetchMethod}:${prop}\n*/\nexport const ${serviceName} = `
  
      const importType = tagInfo?.importType
  
      // 返回值类型
      const normalResponse = methodValueObj.responses['200'] ? methodValueObj.responses['200'].schema : undefined
      const resType = getType(normalResponse)
      const convertTmp = resType?.replace('[', '').replace(']', '')
      if((normalResponse?.$ref || normalResponse?.items?.$ref) && convertTmp && !importType?.includes(convertTmp)){
        // 预设类型没有
        if(!Object.values(convertTypeMap).includes(convertTmp)){
          importType?.push(convertTmp)
        }
      }
  
      const queryParams = []
      const pathParams = []
      const parameters = content[fetchMethod!].parameters
  
      let bodyStr = ''
      for(let paramsItem of parameters){
        const inValue = paramsItem.in;
  
        const convertItem = {
          name: paramsItem.name,
          type: getType(paramsItem),
          required: paramsItem.required,
        }
        // 收集需要导入的类型
        if(inValue === 'body'){
          // 只会有一个 body
          bodyStr = getType(paramsItem.schema)!
          if(paramsItem.schema?.$ref){
            if(bodyStr && !importType?.includes(bodyStr)){
              importType?.push(bodyStr)
            }
          }
        }else if(inValue==='query'){
          // such as /users?role=admin
          queryParams.push(convertItem)
        }else if(inValue === 'path'){
          // such as /users/{id}
          pathParams.push(convertItem)
        }
      }
  
      const queryStr = getParamsStr(queryParams)
      
      const pathStr = handlePathParams(pathParams)
  
  
      serviceStr += `(${queryStr ? 'params: '+ queryStr+', ' : ''}data: ${bodyStr ? bodyStr : '{}'},${pathStr}) => axios.${fetchMethod}<${resType}>(\`${basePath}${convertPath(prop)}\`, {${queryStr ? ' params, ' : ' '}data })\n\n`
  
      tagInfo!.serviceStr = serviceStr!
      tagInfo!.importType = importType!
    }
  }

  globalTags.forEach(tagFile => {
    const fileName = lowerWord(tagFile.description.replace(/\s*/g, '')) + '.ts'
    const dftStr = getImportStr(tagFile.importType) + tagFile.serviceStr
    fs.writeFile(fileName, dftStr, (err: any)=>{
      if(err) throw err;
      console.log(`${fileName} is created successfully`)
    })
  })
}

axios
  .get<SwaggerDocType>('https://petstore.swagger.io/v2/swagger.json')
  .then((res: AxiosResponse<SwaggerDocType>) => {
    if(res){
      // 处理类型定义
      const definitions = res.data.definitions
      let dftStr = ''
      for(let prop in definitions){
        const curValue = definitions[prop]
        if(curValue.type === 'object'){
          dftStr += getDefinitionType(prop, definitions[prop])
        }
      }
      fs.writeFile('newTypes.ts', dftStr, (err: any)=>{
        if(err) throw err;
        console.log(`newTypes.ts is created successfully`)
      })
    }
    // 处理接口
    const paths = res.data.paths
    globalTags = res.data.tags.map((item: Tags)=>({...item, serviceStr: '', importType: []}))
    const basePath = res.data.basePath
    handleService(basePath, paths)
  })
  .catch((error: any) => {
    console.error(error)
  })
