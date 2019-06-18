const config = require('../../config.json')
const VsBridgeApiClient = require('../lib/vsbridge-api')
const api = new VsBridgeApiClient(config)

function putAlias(db, originalName, aliasName, next) {
    let step2 = () => {
        db.indices.putAlias({ index: originalName, name: aliasName }).then(result=>{
            console.log('Index alias created', result)
        }).then(next).catch(err => {
            console.log(err.message)
            next()
        })
    }

    return db.indices.deleteAlias({
        index: aliasName,
        name:  originalName
    }).then((result) => {
        console.log('Public index alias deleted', result)
        step2()
    }).catch((err) => {
        console.log('Public index alias does not exists', err.message)
        step2()
    })
}

function deleteIndex(db, indexName, next) {
    db.indices.delete({
        "index": indexName
      }).then((res) => {
        console.dir(res, { depth: null, colors: true })
        next()
      }).catch(err => {
        console.error(err)
        next(err)
      })
}

function reIndex(db, fromIndexName, toIndexName, next) {
    db.reindex({
      waitForCompletion: true,
      body: {
        "source": {
          "index": fromIndexName
        },
        "dest": {
          "index": toIndexName
        }
      }
    }).then(res => {
      console.dir(res, { depth: null, colors: true })
      next()
    }).catch(err => {
      console.error(err)
      next(err)
    })
}

function createIndex(db, indexName, next) {
    const step2 = () => {
        db.indices.delete({
            "index": indexName
            }).then(res1 => {
                console.dir(res1, { depth: null, colors: true })
                db.indices.create(
                    {
                        "index": indexName
                    }).then(res2 => {
                        console.dir(res2, { depth: null, colors: true })
                        next()
                    }).catch(err => {
                        console.error(err)
                        next(err)
                    })
                }).catch(() => {
                    db.indices.create(
                        {
                        "index": indexName
                        }).then(res2 => {
                            console.dir(res2, { depth: null, colors: true })
                            next()
                        }).catch(err => {
                            console.error(err)
                            next(err)
                        })
                })
    }

    return db.indices.deleteAlias({
        index: '*',
        name:  indexName
    }).then((result) => {
        console.log('Public index alias deleted', result)
        step2()
    }).catch((err) => {
        console.log('Public index alias does not exists', err.message)
        step2()
    })
}

// @TODO: What is the mistery of the next function parameter?
async function putMappings(db, indexName, next, token) {
    // set product mapping
    await db.indices.putMapping({
        index: indexName,
        type: "product",
        body: {
            properties: {
                sku: { type: "keyword" },
                size: { type: "integer" },
                size_options: { type: "integer" },
                price: { type: "float" },
                has_options: { type: "boolean" },            
                special_price: { type: "float" },
                color: { type: "integer" },
                color_options: { type: "integer" },
                pattern: { type: "text" },
                id: { type: "long" },
                status: { type: "integer" },
                weight: { type: "integer" },
                visibility: { type: "integer" },
                created_at: { 
                    type: "date",           
                    format: "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
                },
                updated_at: { 
                    type: "date",           
                    format: "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
                },
                special_from_date: {
                    type: "date",           
                    format: "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
                },
                special_to_date: {
                    type: "date",           
                    format: "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
                },
                news_from_date: {
                    type: "date",           
                    format: "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
                },
                description: { type: "text" },
                name: { type: "text" },
                category_ids: { type: "long" },
                eco_collection: { type: "integer" },
                eco_collection_options: { type: "integer" },
                erin_recommends: { type: "integer" },
                tax_class_id: { type: "long" },
                configurable_children: {
                    properties: {
                        has_options: { type: "boolean" },
                        price: { type: "float" },
                        sku: { type: "keyword" },
                    }
                },
            }
        }
    }).then(res1 => {
        console.dir(res1, { depth: null, colors: true })
    }).catch(err1 => {
        console.error(err1)
        next(err1)
    })

    // set taxrule mapping
    await db.indices.putMapping({
        index: indexName,
        type: "taxrule",
        body: {
            properties: {
                id: { type: "long" },
                rates: {
                    properties: {
                        rate: { type: "float" }
                    }
                }
            }
        }
    }).then(res2 => {
        console.dir(res2, { depth: null, colors: true })
    }).catch(err2 => {
        throw new Error(err2)
    })

    // set attribute mapping
    await db.indices.putMapping({
        index: indexName,
        type: "attribute",
        body: {
            properties: {
                id: { type: "long" },
                attribute_id: { type: "long" },
                default_value: {type: "integer"},
                options: {
                    properties: {
                        value:  { type: "text", "index" : "not_analyzed" }
                    }
                },
                // lw product attributes
                lw_style: { type: "string" },
                lw_room: { type: "string" },
                lw_series: { type: "string" },
                lw_form: { type: "string" },
                lw_wattage: { type: "string" },
                lw_flux: { type: "string" },
                lw_eec_cross_reference_no: { type: "string" },
                lw_color_filter: { type: "string" },
                lw_material_filter: { type: "string" },
                lw_length_cm: { type: "string" },
                lw_bv_rating: { type: "string" },
                lw_width_cm: { type: "string" },
                lw_availability_sorting: { type: "string" },
                lw_mounting_diameter_cm: { type: "string" },
                lw_width_cm: { type: "string" },
                lw_price_off_percentage: { type: "string" },
                lw_height_cm: { type: "string" },
                is_in_stock: { type: "string" },
                is_salable: { type: "string" },
                is_on_sale: { type: "string" },
                lw_is_premium: { type: "string" },
                lw_has_fan_forward_return: { type: "string" },
                lw_is_led_technology: { type: "string" },
                lw_has_switch: { type: "string" },
                lw_has_remote_control: { type: "string" },
                lw_has_motion_sensor: { type: "string" },
                lw_depth_cm: { type: "string" },
                lw_has_motion_sensor: { type: "string" },
                lw_diameter_cm: { type: "string" },
                lw_mercury_level: { type: "string" },
                configurable_children: {
                    properties: {
                        attribute_id: { type: "long" },
                        default_label: { type: "text"},
                        label: { type: "text"},
                        frontend_label: { type: "text"},   
                        store_label: { type: "text"},
                        // lw variant attributes
                        lw_style: { type: "string" },
                        lw_room: { type: "string" },
                        lw_series: { type: "string" },
                        lw_form: { type: "string" },
                        lw_wattage: { type: "string" },
                        lw_flux: { type: "string" },
                        lw_eec_cross_reference_no: { type: "string" },
                        lw_color_filter: { type: "string" },
                        lw_material_filter: { type: "string" },
                        lw_length_cm: { type: "string" },
                        lw_bv_rating: { type: "string" },
                        lw_width_cm: { type: "string" },
                        lw_availability_sorting: { type: "string" },
                        lw_mounting_diameter_cm: { type: "string" },
                        lw_width_cm: { type: "string" },
                        lw_price_off_percentage: { type: "string" },
                        lw_height_cm: { type: "string" },
                        is_in_stock: { type: "string" },
                        is_salable: { type: "string" },
                        is_on_sale: { type: "string" },
                        lw_is_premium: { type: "string" },
                        lw_has_fan_forward_return: { type: "string" },
                        lw_is_led_technology: { type: "string" },
                        lw_has_switch: { type: "string" },
                        lw_has_remote_control: { type: "string" },
                        lw_has_motion_sensor: { type: "string" },
                        lw_depth_cm: { type: "string" },
                        lw_has_motion_sensor: { type: "string" },
                        lw_diameter_cm: { type: "string" },
                        lw_mercury_level: { type: "string" },
                    }
                },
            }
        }
    }).then(res3 => {
        console.dir(res3, { depth: null, colors: true })
        next()
    }).catch(err3 => {
        throw new Error(err3)
    })

    // set category mapping
    await db.indices.putMapping({
        index: indexName,
        type: "category",
        body: {
            properties: {
                // lw navision attributes
                nav_id: { type: "text" },
                nav_brand_code: { type: "string" },
            }
        }
    }).then(res4 => {
        console.dir(res4, { depth: null, colors: true })
    }).catch(err4 => {
        throw new Error(err4)
    })

    // set cms_hierarchy mapping
    await db.indices.putMapping({
        index: indexName,
        type: "cms_hierarchy",
        body: {
            properties: {
                xpath: { type: "string" },
            }
        }
    }).then(res => {
        console.dir(res, { depth: null, colors: true })
    }).catch(err => {
        throw new Error(err)
    })

    // set cms_page mapping
    await db.indices.putMapping({
        index: indexName,
        type: "cms_page",
        body: {
            properties: {
                identifier: { "type": "string", "index" : "not_analyzed" },
            }
        }
    }).then(res => {
        console.dir(res, { depth: null, colors: true })
    }).catch(err => {
        throw new Error(err)
    })

    // set cms_block mapping
    await db.indices.putMapping({
        index: indexName,
        type: "cms_block",
        body: {
            properties: {
                // nothing needed by now
            }
        }
    }).then(res => {
        console.dir(res, { depth: null, colors: true })
    }).catch(err => {
        throw new Error(err)
    })

}

/**
 * Get attribute data for mappings
 */
function getAttributeData(token) {
    let promise = new Promise((resolve, reject) => {
        console.log('*** Getting attribute data')
        api.authWith(token);
        api.get(config.vsbridge['product_mapping_endpoint']).type('json').end((resp) => {
            if (resp.body && resp.body.code !== 200) { // unauthroized request
                console.log(resp.body.result);
                process.exit(-1)
            }
            resolve(resp.body.result);
            reject('Attribute data not available now, please try again later');
        })
    });

    return promise
        .then(
            result => (result),
            error => (error)
        );
}

module.exports = {
    putMappings,
    putAlias,
    createIndex,
    deleteIndex,
    reIndex
}