package com.circle;

import android.content.Context;
import android.util.Log;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Serves {@link State} as JSON on loopback port 8081. The runner forwards it
 * with {@code adb forward tcp:8081 tcp:8081} and reads it as the oracle state,
 * the same role {@code window.__circle} plays on web.
 */
public final class StateServer {
    private static final String TAG = "CircleStateServer";
    private static final int PORT = 8081;

    private final State state;
    private ServerSocket server;

    public StateServer(Context context) {
        state = new State(context);
    }

    private static StateServer instance;

    /** Start the singleton server; safe to call from every activity. */
    public static synchronized void ensure(Context context) {
        if (instance == null) {
            instance = new StateServer(context.getApplicationContext());
            instance.start();
        }
    }

    public synchronized void start() {
        if (server != null) return;
        Thread thread = new Thread(this::serve, "circle-state");
        thread.setDaemon(true);
        thread.start();
    }

    private void serve() {
        try {
            server = new ServerSocket();
            server.setReuseAddress(true);
            server.bind(new java.net.InetSocketAddress("127.0.0.1", PORT));
        } catch (Exception e) {
            Log.w(TAG, "state server unavailable", e);
            return;
        }
        while (!server.isClosed()) {
            try {
                Socket socket = server.accept();
                handle(socket);
            } catch (Exception e) {
                Log.w(TAG, "accept failed", e);
            }
        }
    }

    private void handle(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(5000);
            byte[] body = state.toJson().getBytes(StandardCharsets.UTF_8);
            String head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                    + body.length + "\r\nConnection: close\r\n\r\n";
            OutputStream out = s.getOutputStream();
            out.write(head.getBytes(StandardCharsets.UTF_8));
            out.write(body);
            out.flush();
        } catch (Exception e) {
            Log.w(TAG, "serve failed", e);
        }
    }
}
