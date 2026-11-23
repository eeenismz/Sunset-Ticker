<?php
// Test helper: the harness POSTs its JSON result here so a real-time headless Chrome run can be read from a file.
file_put_contents(__DIR__ . '/out-' . preg_replace('/[^a-z0-9_-]/i', '', $_GET['tag'] ?? 'x') . '.json', file_get_contents('php://input'));
