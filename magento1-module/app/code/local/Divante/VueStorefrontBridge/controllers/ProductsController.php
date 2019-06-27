<?php
require_once('AbstractController.php');

/**
 * Divante VueStorefrontBridge ProductsController Class
 *
 * @category    Divante
 * @package     VueStorefrontBridge
 * @author      Piotr Karwatka <pkarwatka@divante.co>
 * @author      Dariusz Oliwa <doliwa@divante.co>
 * @copyright   Copyright (C) 2018
 * @license     MIT License
 */
class Divante_VueStorefrontBridge_ProductsController extends Divante_VueStorefrontBridge_AbstractController
{
    public function indexAction()
    {
        if ($this->_authorizeAdminUser($this->getRequest())) {
            $params = $this->_processParams($this->getRequest());
            $confChildBlacklist = [
                'entity_id',
                'id',
                'type_id',
                'updated_at',
                'created_at',
                'stock_item',
                'short_description',
                'page_layout',
                'news_from_date',
                'news_to_date',
                'meta_description',
                'meta_keyword',
                'meta_title',
                'description',
                'attribute_set_id',
                'entity_type_id',
                'has_options',
                'required_options',
            ];

            $result = [];

            // get product collection
            $productCollection = Mage::getModel('catalog/product')
                ->getCollection()
                ->addAttributeToSort('updated_at', 'DESC')
                ->addAttributeToSelect('*')
                ->setPage($params['page'], $params['pageSize']);

            if (isset($params['type_id']) && $params['type_id']) {
                $productCollection->addFieldToFilter('type_id', $params['type_id']);
            }

            // map products
            foreach ($productCollection as $product) {
                // add some fields that vuestorefront demo shop has
                $productDTO['product_links'] = [];
                $productDTO['custom_attributes'] = null;

                // add prices
                $productDTO['regular_price'] = $product->getPrice();
                $productDTO['max_regular_price'] = $product->getMaxPrice();
                $productDTO['minimal_regular_price'] = $product->getMinPrice();
                $productDTO['priceInclTax'] = $product->getPrice();
                $productDTO['specialPriceInclTax'] = $product->getSpecialPrice();
                $productDTO['originalPrice'] = $product->getPrice();
                $productDTO['originalPriceInclTax'] = $product->getPrice();

                // add media gallery to product
                $product->load('media_gallery');
                $productDTO['media_gallery'] = $product->getMediaGalleryImages();
                
                // add and modify prodcut data
                $productDTO = $product->getData();
                $productDTO['id'] = intval($productDTO['entity_id']);
                unset($productDTO['entity_id']);
                $productDTO['slug'] = $productDTO['url_key'];
                

                // add stock information
                // > why was this unset?
                // unset($productDTO['stock_item']);
                $stock = Mage::getModel('cataloginventory/stock_item')->loadByProduct($product);
                $productDTO['stock'] = $stock->getData();
                if (isset($productDTO['stock']['is_in_stock']) && $productDTO['stock']['is_in_stock'] == 1) {
                    $productDTO['stock']['is_in_stock'] = true;
                } else {
                    $productDTO['stock']['is_in_stock'] = false;
                }

                // add product variants
                if ($productDTO['type_id'] !== 'simple') {
                    $configurable = Mage::getModel('catalog/product_type_configurable')->setProduct($product);
                    $childProducts = $configurable
                        ->getUsedProductCollection()
                        ->addAttributeToSelect('*')
                        ->addFilterByRequiredOptions();

                    $productDTO['configurable_children'] = [];
                    foreach ($childProducts as $child) {
                        $childDTO = $child->getData();
                        $childDTO['id'] = intval($childDTO['entity_id']);
                        $childDTO['slug'] = $childDTO['url_key'];
                        $productAttributeOptions = $product
                            ->getTypeInstance(true)
                            ->getConfigurableAttributesAsArray(
                                $product
                            );
                        $productDTO['configurable_options'] = [];

                        foreach ($productAttributeOptions as $productAttribute) {
                            if (!isset($productDTO[$productAttribute['attribute_code'] . '_options'])) {
                                $productDTO[$productAttribute['attribute_code'] . '_options'] = [];
                            }

                            $productDTO['configurable_options'][] = $productAttribute;
                            $availableOptions = [];

                            foreach ($productAttribute['values'] as $aOp) {
                                $availableOptions[] = $aOp['value_index'];
                            }

                            $productDTO[$productAttribute['attribute_code'] . '_options'] = $availableOptions;
                        }

                        $childDTO = $this->_filterDTO($childDTO, $confChildBlacklist);
                        $productDTO['configurable_children'][] = $childDTO;
                    }
                }

                // add categorys to product
                $cats = $product->getCategoryIds();
                $productDTO['category'] = [];
                $productDTO['category_ids'] = [];
                foreach ($cats as $category_id) {
                    $cat = Mage::getModel('catalog/category')->load($category_id);
                    $productDTO['category'][] = [
                        'category_id' => $cat->getId(),
                        'name' => $cat->getName(),
                    ];
                    $productDTO['category_ids'][] = (string) $category_id;
                }

                // fix timestamp
                $productDTO['created_at'] = date('Y-m-d H:i:s', strtotime($productDTO['created_at']));

                // ATTRIBUTE TEST
                // > why are those unset? got it, added elastic node type mapping.
                unset($productDTO['lw_style']);
                unset($productDTO['lw_room']);
                unset($productDTO['lw_series']);
                unset($productDTO['lw_form']);
                unset($productDTO['lw_wattage']);
                unset($productDTO['lw_flux']);
                unset($productDTO['lw_eec_cross_reference_no']);
                unset($productDTO['lw_color_filter']);
                unset($productDTO['lw_material_filter']);
                unset($productDTO['lw_length_cm']);
                unset($productDTO['lw_bv_rating']);
                unset($productDTO['lw_width_cm']);
                unset($productDTO['lw_availability_sorting']);
                unset($productDTO['lw_mounting_diameter_cm']);
                unset($productDTO['lw_width_cm']);
                unset($productDTO['lw_price_off_percentage']);
                unset($productDTO['lw_height_cm']);
                unset($productDTO['is_in_stock']);
                unset($productDTO['is_salable']);
                unset($productDTO['is_on_sale']);
                unset($productDTO['lw_is_premium']);
                unset($productDTO['lw_has_fan_forward_return']);
                unset($productDTO['lw_is_led_technology']);
                unset($productDTO['lw_has_switch']);
                unset($productDTO['lw_has_remote_control']);
                unset($productDTO['lw_has_motion_sensor']);
                unset($productDTO['lw_depth_cm']);
                unset($productDTO['lw_has_motion_sensor']);
                unset($productDTO['lw_diameter_cm']);
                unset($productDTO['lw_mercury_level']);

                // > why are those unset? got it, added elastic node type mapping.
                unset($productDTO['configurable_children']['lw_style']);
                unset($productDTO['configurable_children']['lw_series']);
                unset($productDTO['configurable_children']['lw_eec_cross_reference_no']);
                unset($productDTO['configurable_children']['lw_form']);
                unset($productDTO['configurable_children']['lw_material_filter']);
                unset($productDTO['configurable_children']['lw_color_filter']);
                unset($productDTO['configurable_children']['lw_room']);
                unset($productDTO['configurable_children']['lw_flux']);
                unset($productDTO['configurable_children']['lw_form']);
                unset($productDTO['configurable_children']['lw_material_filter']);
                unset($productDTO['configurable_children']['lw_wattage']);
                unset($productDTO['configurable_children']['lw_length_cm']);
                unset($productDTO['configurable_children']['lw_bv_rating']);
                unset($productDTO['configurable_children']['lw_width_cm']);
                unset($productDTO['configurable_children']['lw_availability_sorting']);
                unset($productDTO['configurable_children']['lw_mounting_diameter_cm']);
                unset($productDTO['configurable_children']['options.label']);
                unset($productDTO['configurable_children']['options']['label']);
                unset($productDTO['configurable_children']['lw_width_cm']);
                unset($productDTO['configurable_children']['lw_price_off_percentage']);
                unset($productDTO['configurable_children']['lw_height_cm']);

                // > why are those unset? got it, added elastic node type mapping.
                unset($productDTO['configurable_children.lw_style']);
                unset($productDTO['configurable_children.lw_series']);
                unset($productDTO['configurable_children.lw_eec_cross_reference_no']);
                unset($productDTO['configurable_children.lw_form']);
                unset($productDTO['configurable_children.lw_material_filter']);
                unset($productDTO['configurable_children.lw_color_filter']);
                unset($productDTO['configurable_children.lw_room']);
                unset($productDTO['configurable_children.lw_flux']);
                unset($productDTO['configurable_children.lw_form']);
                unset($productDTO['configurable_children.lw_material_filter']);
                unset($productDTO['configurable_children.lw_wattage']);
                unset($productDTO['configurable_children.lw_length_cm']);
                unset($productDTO['configurable_children.lw_bv_rating']);
                unset($productDTO['configurable_children.lw_width_cm']);
                unset($productDTO['configurable_children.lw_availability_sorting']);
                unset($productDTO['configurable_children.lw_mounting_diameter_cm']);
                unset($productDTO['configurable_children.options.label']);
                unset($productDTO['configurable_children.options']['label']);
                unset($productDTO['configurable_children.lw_width_cm']);
                unset($productDTO['configurable_children.lw_price_off_percentage']);
                unset($productDTO['configurable_children.lw_height_cm']);
                // ATTRIBUTE TEST

                $productDTO = $this->_filterDTO($productDTO);
                $result[] = $productDTO;
            }

            $this->_result(200, $result);
        }
    }
}
