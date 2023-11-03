import { ICommonObject, INode, INodeData as INodeDataFromComponent, INodeParams } from 'flowise-components'

export type MessageType = 'apiMessage' | 'userMessage'

/**
 * Databases
 */
export interface IChatFlow {
    id: string
    name: string
    url: string
    spaceAddress: string
    description: string
    flowData: string
    apikeyid: string
    deployed: number
    deleted: boolean
    owner: string
    exported: boolean
    updatedDate: Date
    createdDate: Date
    deployDate: Date
    tags: string
    chatbotConfig?: string
}

export interface ITemplate {
    id: string
    name: string
    description: string
    flowData: string
    owner: string
    author: string
    tags: string
    createdDate: Date
}

export interface IChatMessage {
    id: string
    role: MessageType
    content: string
    chatflowid: string
    createdDate: Date
    sourceDocuments: string
}

export interface ITool {
    id: string
    name: string
    description: string
    color: string
    schema: string
    func: string
    updatedDate: Date
    createdDate: Date
    owner: string
}

export interface IComponentNodes {
    [key: string]: INode
}

export interface IComponentVersionNodes {
    [key: string]: IComponentNodes
}

export interface IVariableDict {
    [key: string]: string
}

export interface INodeDependencies {
    [key: string]: number
}

export interface INodeDirectedGraph {
    [key: string]: string[]
}

export interface INodeData extends INodeDataFromComponent {
    inputAnchors: INodeParams[]
    inputParams: INodeParams[]
    outputAnchors: INodeParams[]
}

export interface IReactFlowNode {
    id: string
    position: {
        x: number
        y: number
    }
    type: string
    data: INodeData
    positionAbsolute: {
        x: number
        y: number
    }
    z: number
    handleBounds: {
        source: any
        target: any
    }
    width: number
    height: number
    selected: boolean
    dragging: boolean
}

export interface IReactFlowEdge {
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    type: string
    id: string
    data: {
        label: string
    }
}

export interface IReactFlowObject {
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    viewport: {
        x: number
        y: number
        zoom: number
    }
}

export interface IExploredNode {
    [key: string]: {
        remainingLoop: number
        lastSeenDepth: number
    }
}

export interface INodeQueue {
    nodeId: string
    depth: number
}

export interface IDepthQueue {
    [key: string]: number
}

export interface IMessage {
    message: string
    type: MessageType
}

export interface IncomingInput {
    question: string
    history: IMessage[]
    overrideConfig?: ICommonObject
    socketIOClientId?: string
}

export interface IActiveChatflows {
    [key: string]: {
        startingNodes: IReactFlowNode[]
        endingNodeData: INodeData
        inSync: boolean
        overrideConfig?: ICommonObject
    }
}

export interface IOverrideConfig {
    node: string
    label: string
    name: string
    type: string
}

export interface IDatabaseExport {
    chatmessages: IChatMessage[]
    chatflows: IChatFlow[]
    apikeys: ICommonObject[]
}

export interface IRunChatflowMessageValue {
    chatflow: IChatFlow
    chatId: string
    incomingInput: IncomingInput
    componentNodes: IComponentNodes
    endingNodeData?: INodeData
}

declare global {
    namespace Express {
        export interface Request {
            user: any
        }
    }
}

export interface ICredential {
    id: string
    name: string
    credentialName: string
    encryptedData: string
    updatedDate: Date
    createdDate: Date
}

export type ICredentialDataDecrypted = ICommonObject

// Plain credential object sent to server
export interface ICredentialReqBody {
    name: string
    credentialName: string
    plainDataObj: ICredentialDataDecrypted
}

// Plain credential object sent to server
export interface ICredentialReqBody {
    name: string
    credentialName: string
    plainDataObj: ICredentialDataDecrypted
}

export interface IComponentCredentials {
    [key: string]: INode
}

// Decrypted credential object sent back to client
export interface ICredentialReturnResponse extends ICredential {
    plainDataObj: ICredentialDataDecrypted
}