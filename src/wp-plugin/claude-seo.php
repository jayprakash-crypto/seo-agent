<?php
/**
 * Plugin Name: Claude SEO Connector
 * Description: Exposes a bulk meta-update REST endpoint for the Claude SEO Agent.
 * Version:     1.0.0
 * Author:      SEO Agent
 * License:     GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'rest_api_init', 'claude_seo_register_routes' );

function claude_seo_register_routes(): void {
    register_rest_route(
        'claude-seo/v1',
        '/bulk-meta-update',
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'claude_seo_bulk_meta_update',
            'permission_callback' => 'claude_seo_check_permissions',
            'args'                => [
                'updates' => [
                    'required'          => true,
                    'type'              => 'array',
                    'description'       => 'Array of {url, title, description} objects.',
                    'items'             => [
                        'type'       => 'object',
                        'properties' => [
                            'url'         => [ 'type' => 'string', 'required' => true ],
                            'title'       => [ 'type' => 'string' ],
                            'description' => [ 'type' => 'string' ],
                        ],
                    ],
                    'sanitize_callback' => 'claude_seo_sanitize_updates',
                ],
            ],
        ]
    );
}

/**
 * Permission check: valid WP REST nonce + manage_options capability.
 */
function claude_seo_check_permissions( WP_REST_Request $request ): bool|WP_Error {
    $nonce = $request->get_header( 'X-WP-Nonce' );
    if ( empty( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
        return new WP_Error(
            'invalid_nonce',
            __( 'Invalid or missing nonce.', 'claude-seo' ),
            [ 'status' => 403 ]
        );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        return new WP_Error(
            'forbidden',
            __( 'You do not have permission to perform this action.', 'claude-seo' ),
            [ 'status' => 403 ]
        );
    }
    return true;
}

/**
 * Sanitize the updates array.
 *
 * @param array $updates Raw updates from request.
 * @return array Sanitized updates.
 */
function claude_seo_sanitize_updates( array $updates ): array {
    return array_map( static function ( $item ) {
        return [
            'url'         => esc_url_raw( $item['url'] ?? '' ),
            'title'       => sanitize_text_field( $item['title'] ?? '' ),
            'description' => sanitize_text_field( $item['description'] ?? '' ),
        ];
    }, $updates );
}

/**
 * Bulk-update SEO title and meta description for a list of pages/posts.
 *
 * @param WP_REST_Request $request REST request object.
 * @return WP_REST_Response
 */
function claude_seo_bulk_meta_update( WP_REST_Request $request ): WP_REST_Response {
    $updates = $request->get_param( 'updates' );
    $updated = 0;
    $errors  = [];

    foreach ( $updates as $item ) {
        $url         = $item['url'] ?? '';
        $title       = $item['title'] ?? '';
        $description = $item['description'] ?? '';

        if ( empty( $url ) ) {
            $errors[] = [ 'url' => $url, 'error' => 'url is required' ];
            continue;
        }

        if ( empty( $title ) && empty( $description ) ) {
            $errors[] = [ 'url' => $url, 'error' => 'at least one of title or description is required' ];
            continue;
        }

        $post_id = url_to_postid( $url );
        if ( ! $post_id ) {
            $errors[] = [ 'url' => $url, 'error' => 'Post not found for this URL' ];
            continue;
        }

        // Update native WP post title if provided
        if ( ! empty( $title ) ) {
            $result = wp_update_post(
                [ 'ID' => $post_id, 'post_title' => $title ],
                true
            );
            if ( is_wp_error( $result ) ) {
                $errors[] = [ 'url' => $url, 'error' => $result->get_error_message() ];
                continue;
            }
        }

        // Update Yoast SEO meta fields
        if ( ! empty( $title ) ) {
            update_post_meta( $post_id, '_yoast_wpseo_title', $title );
        }
        if ( ! empty( $description ) ) {
            update_post_meta( $post_id, '_yoast_wpseo_metadesc', $description );
        }

        $updated++;
    }

    return new WP_REST_Response(
        [
            'updated' => $updated,
            'errors'  => $errors,
        ],
        200
    );
}
