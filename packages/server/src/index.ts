import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import cors from 'cors'
import http from 'http'
import * as fs from 'fs'
import { Server } from 'socket.io'
import logger from './utils/logger'
import { expressRequestLogger } from './utils/logger'

import {
    IncomingInput,
    IReactFlowNode,
    IReactFlowObject,
    INodeData,
} from './Interface'
import {
    getStartingNodes,
    buildLangchain,
    getEndingNode,
    constructGraphs,
    resolveVariables,
    isStartNodeDependOnInput,
    getAPIKeys,
    compareKeys,
    isFlowValidForStream,
    isVectorStoreFaiss,
    getNodeFilePath
} from './utils'
import { getDataSource } from './DataSource'
import { initCredential } from './DataSource'
import { NodesPool } from './NodesPool'
import { ChatflowPool } from './ChatflowPool'
import { CachePool } from './CachePool'

const Layer = require('express/lib/router/layer')

// global error handle middleware for all apis
Object.defineProperty(Layer.prototype, 'handle', {
    enumerable: true,
    get() {
        return this.__handle
    },
    set(fn) {
        if (fn.length === 4) {
            this.__handle = fn
        } else {
            this.__handle = (req: Request, res: Response, next: NextFunction) => {
                Promise.resolve()
                    .then(() => fn(req, res, next))
                    .catch(next)
            }
        }
    }
})

export class App {
    app: express.Application
    nodesPool: NodesPool
    chatflowPool: ChatflowPool
    AppDataSource = getDataSource()
    cachePool: CachePool
    parsedFlowData: IReactFlowObject

    constructor() {
        this.app = express()
    }

    async initDatabase() {
        // Initialize database
        this.AppDataSource.initialize()
            .then(async () => {
                console.info('📦[server]: Data Source has been initialized!')

                // Initialize pools
                this.nodesPool = new NodesPool()
                await this.nodesPool.initialize()

                this.chatflowPool = new ChatflowPool()
                // Initialize cache pool
                this.cachePool = new CachePool()

                let confFile = path.join(__dirname, '..', 'config', 'conf.json')
                let flowData = JSON.parse(fs.readFileSync(confFile, 'utf8'))
                this.parsedFlowData = flowData
                if (flowData.credentialRecords){
                    // Initialize credentials
                    initCredential(flowData.credentialRecords)
                }

            })
            .catch((err) => {
                console.error('❌[server]: Error during Data Source initialization:', err)
            })
    }

    async config(socketIO?: Server) {
        // Limit is needed to allow sending/receiving base64 encoded string
        this.app.use(express.json({ limit: '50mb' }))
        this.app.use(express.urlencoded({ limit: '50mb', extended: true }))

        // Allow access from *
        this.app.use(cors())
        // Add the expressRequestLogger middleware to log all requests
        this.app.use(expressRequestLogger)

        const upload = multer({ dest: `${path.join(__dirname, '..', 'uploads')}/` })


        // ----------------------------------------
        // Prediction
        // ----------------------------------------

        // Send input message and get prediction result (External)
        this.app.post('/api/v1/prediction/:id', upload.array('files'), async (req: Request, res: Response) => {
            await this.processPrediction(req, res, socketIO)
        })

        // Send input message and get prediction result (Internal)
        this.app.post('/api/v1/internal-prediction/:id', async (req: Request, res: Response) => {
            await this.processPrediction(req, res, socketIO, true)
        })

    }

    /**
     * Process Prediction
     * @param {Request} req
     * @param {Response} res
     * @param {Server} socketIO
     * @param {boolean} isInternal
     */
    async processPrediction(req: Request, res: Response, socketIO?: Server, isInternal = false) {
        try {
            const chatflowid = req.params.id
            let incomingInput: IncomingInput = req.body

            let nodeToExecuteData: INodeData

            // let flowData: string

            // let confFile = path.join(__dirname, '..', 'config', 'conf.json')
            // flowData = fs.readFileSync(confFile, 'utf8')

            let isStreamValid = false

            /* Don't rebuild the flow (to avoid duplicated upsert, recomputation) when all these conditions met:
             * - Node Data already exists in pool
             * - Flow doesn't start with nodes that depend on incomingInput.question
             ***/
            const couldReuse = () => {
                return (
                    Object.prototype.hasOwnProperty.call(this.chatflowPool.activeChatflows, chatflowid) &&
                    !isStartNodeDependOnInput(this.chatflowPool.activeChatflows[chatflowid].startingNodes)
                )
            }

            /*** Get chatflows and prepare data  ***/
            const parsedFlowData: IReactFlowObject = this.parsedFlowData
            const nodes = parsedFlowData.nodes
            const edges = parsedFlowData.edges
            const owner = 'pengLee'

            const isReuse = couldReuse()
            if (isReuse) {
                nodeToExecuteData = this.chatflowPool.activeChatflows[chatflowid].endingNodeData
                isStreamValid = isFlowValidForStream(nodes, nodeToExecuteData)
            } else {
                /*** Get Ending Node with Directed Graph  ***/
                const { graph, nodeDependencies } = constructGraphs(nodes, edges)
                const directedGraph = graph
                const endingNodeId = getEndingNode(nodeDependencies, directedGraph)
                if (!endingNodeId) return res.status(500).send(`Ending node must be either a Chain or Agent`)

                const endingNodeData = nodes.find((nd) => nd.id === endingNodeId)?.data
                if (!endingNodeData) return res.status(500).send(`Ending node must be either a Chain or Agent`)

                if (
                    endingNodeData.outputs &&
                    Object.keys(endingNodeData.outputs).length &&
                    !Object.values(endingNodeData.outputs).includes(endingNodeData.name)
                ) {
                    return res
                        .status(500)
                        .send(
                            `Output of ${endingNodeData.label} (${endingNodeData.id}) must be ${endingNodeData.label}, can't be an Output Prediction`
                        )
                }

                isStreamValid = isFlowValidForStream(nodes, endingNodeData)

                /*** Get Starting Nodes with Non-Directed Graph ***/
                const constructedObj = constructGraphs(nodes, edges, true)
                const nonDirectedGraph = constructedObj.graph
                const { startingNodeIds, depthQueue } = getStartingNodes(nonDirectedGraph, endingNodeId)

                /*** BFS to traverse from Starting Nodes to Ending Node ***/
                const reactFlowNodes = await buildLangchain(
                    startingNodeIds,
                    nodes,
                    graph,
                    depthQueue,
                    this.nodesPool.componentVersionNodes,
                    incomingInput.question,
                    this.AppDataSource,
                    incomingInput?.overrideConfig,
                    this.cachePool
                )

                const nodeToExecute = reactFlowNodes.find((node: IReactFlowNode) => node.id === endingNodeId)
                if (!nodeToExecute) return res.status(404).send(`Node ${endingNodeId} not found`)

                const reactFlowNodeData: INodeData = resolveVariables(nodeToExecute.data, reactFlowNodes, incomingInput.question)
                nodeToExecuteData = reactFlowNodeData

                const startingNodes = nodes.filter((nd) => startingNodeIds.includes(nd.id))
                this.chatflowPool.add(chatflowid, nodeToExecuteData, startingNodes, incomingInput?.overrideConfig)
            }

            // const nodeInstanceFilePath = this.nodesPool.componentNodes[nodeToExecuteData.name].filePath as string
            const nodeInstanceFilePath = getNodeFilePath(nodeToExecuteData, this.nodesPool.componentVersionNodes)
            const nodeModule = await import(nodeInstanceFilePath)
            const nodeInstance = new nodeModule.nodeClass()

            isStreamValid = isStreamValid && !isVectorStoreFaiss(nodeToExecuteData)
            
            const result = isStreamValid
                ? await nodeInstance.run(nodeToExecuteData, incomingInput.question, {
                    chatHistory: incomingInput.history,
                    socketIO,
                    socketIOClientId: incomingInput.socketIOClientId,
                    logger
                })
                : await nodeInstance.run(nodeToExecuteData, incomingInput.question, {
                    chatHistory: incomingInput.history,
                    logger
                })
            // console.log('predict->result', result)
            return res.json(result)
        } catch (e: any) {
            return res.status(500).send(e.message)
        }
    }

    async stopApp() {
        try {
            const removePromises: any[] = []
            await Promise.all(removePromises)
        } catch (e) {
            console.error(`❌[server]: Flowise Server shut down error: ${e}`)
        }
    }
}

let serverApp: App | undefined

export async function start(): Promise<void> {
    serverApp = new App()

    const port = parseInt(process.env.PORT || '', 10) || 3000
    const server = http.createServer(serverApp.app)

    const io = new Server(server, {
        cors: {
            origin: '*'
        }
    })

    await serverApp.initDatabase()
    await serverApp.config(io)

    server.listen(port, () => {
        console.info(`⚡️[server]: Flowise Server is listening at ${port}`)
    })
}

export function getInstance(): App | undefined {
    return serverApp
}
