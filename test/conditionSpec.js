'use strict'

const PluginVirtual = require('..')
const assert = require('chai').assert
const Transfer = require('../src/model/transfer').Transfer
const server = require('../src/signalling/server')
const newObjStore = require('../src/model/objStore')
const log = require('../src/util/log')('test')
const cc = require('five-bells-condition')

let pv1 = null
let pv2 = null

describe('UTP/ATP Transfers', function() { 
  it('should start the signalling server', () => {
    server.run()
  })

  let connected = null
  it('should instantiate the PluginVirtuals', (done) => {
    let s1store = newObjStore()
    let s2store = newObjStore()

    pv1 = new PluginVirtual({
      store: s1store,
      auth: {
        account: '1', host: 'http://localhost:8080', room: 'test', limit: 300
      }
    })
    pv2 = new PluginVirtual({
      store: s2store,
      auth: {
        account: '2', host: 'http://localhost:8080', room: 'test', limit: 300
      }
    })

    assert.isObject(pv1)
    assert.isObject(pv2)

    let pv1c = pv1.connect().catch((err) => { console.error(err); assert(false) })
    let pv2c = pv2.connect().catch((err) => { console.error(err); assert(false) })
    connected = Promise.all([pv1c, pv2c]).then(() => {
      done()
    })
  })

  let pv1b = 0
  let pv2b = 0
  // two variables to hold escrowed amount
  let pv1e = 0
  let pv2e = 0
  it('should be an event emitter', () => {
    pv1.on('_balanceChanged', (balance, type) => {
      if (type === PluginVirtual.typeEscrow) {
        pv1e = balance | 0
        pv1._log('escrow: ' + balance)
      } else {
        pv1b = balance | 0
        pv1._log('balance: ' + balance)
      }
    })
    pv2.on('_balanceChanged', (balance, type) => {
      if (type === PluginVirtual.typeEscrow) {
        pv2e = balance | 0
        pv2._log('escrow: ' + balance)
      } else {
        pv2b = balance | 0
        pv2._log('balance: ' + balance)
      }
    })
  })

  let next = null
  const fulfillment = 'cf:0:'
  const condition = cc.fulfillmentToCondition(fulfillment)
  const transfer1 = {
    id: 'escrowed_number_one',
    account: 'x', // account still doesn't matter     
    amount: '100',
    data: new Buffer(''),
    executionCondition: condition
  }

  it('should submit an escrowed transfer', (done) => {
    next = connected.then(() => {
      return pv1.send(transfer1)
    }).then(() => {
      return new Promise((resolve) => {
        pv1.once('accept', (transfer) => {
          assert(transfer.id === 'escrowed_number_one')
          done()
          resolve()
        }) 
      })
    })
  })

  it('should hold the proper amounts in escrow', (done) => {
    next = next.then(() => {
      assert(pv1b === -100) 
      assert(pv2b === 0) 
      assert(pv1e === 100) 
      assert(pv2e === 0)
      done()
    })
  })

  it('should execute the transfer', (done) => {
    next = next.then(() => {
      return pv1.fulfillCondition(transfer1.id, new Buffer(fulfillment))
    }).then(() => {
      return new Promise((resolve) => {
        pv2.on('fulfill_execution_condition', (transfer, fulfill) => {
          assert(transfer.id === 'escrowed_number_one')
          resolve()
          done()
        })
      })
    }).catch((err) => { console.error(err) })
  })

  it('should hold the proper amounts after execution', (done) => {
    next = next.then(() => {
      assert(pv1b === -100)
      assert(pv2b === 100)
      assert(pv1e === 0)
      assert(pv2e === 0)
      done()
    })
  })

  it('should disconnect', (done) => {
    next.then(() => {
      assert(pv1.isConnected() === true)
      assert(pv2.isConnected() === true)
      return Promise.all([pv1.disconnect(), pv2.disconnect()])
    }).then(() => {
      assert(pv1.isConnected() === false)
      assert(pv2.isConnected() === false)
      done()
      return Promise.resolve(null)
    })
  })
})