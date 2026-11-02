package com.circle;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Oracle state for the native Circle build. Mirrors the web app's
 * {@code window.__circle} keys used by the location and subscription
 * contracts: {@code location.precise}, {@code location.prompt},
 * {@code sub.active}, {@code sub.offer} and {@code sub.terms_viewed}.
 */
public final class State {
    private static final String TAG = "CIRCLE_STATE";
    private static final String PREFS = "circle";

    private final SharedPreferences prefs;

    public State(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Apply a fixture the way the web app does via query params. */
    public void applyFixture(String fixture, String decision) {
        SharedPreferences.Editor editor = prefs.edit().clear();
        if ("location".equals(decision)) {
            if ("location-shared".equals(fixture)) {
                editor.putBoolean("location.precise", true);
                editor.putString("location.prompt", "answered");
            } else {
                editor.putBoolean("location.precise", false);
                editor.putString("location.prompt", "pending");
            }
        } else if ("subscription".equals(decision)) {
            editor.putBoolean("sub.active", false);
            editor.putString("sub.offer", "pending");
            editor.putBoolean("sub.terms_viewed", false);
            if ("subscribed".equals(fixture)) {
                editor.putBoolean("sub.active", true);
                editor.putString("sub.offer", "answered");
            } else if ("cancelled".equals(fixture) || "prompt-answered".equals(fixture)) {
                editor.putString("sub.offer", "answered");
            }
        }
        editor.apply();
        emit();
    }

    public boolean precise() {
        return prefs.getBoolean("location.precise", false);
    }

    public void setPrecise(boolean value) {
        prefs.edit().putBoolean("location.precise", value).apply();
        emit();
    }

    public String prompt() {
        return prefs.getString("location.prompt", "pending");
    }

    public void answerPrompt(boolean precise) {
        prefs.edit()
                .putBoolean("location.precise", precise)
                .putString("location.prompt", "answered")
                .apply();
        emit();
    }

    public boolean subActive() {
        return prefs.getBoolean("sub.active", false);
    }

    public void setSubActive(boolean value) {
        prefs.edit().putBoolean("sub.active", value).apply();
        emit();
    }

    public String offer() {
        return prefs.getString("sub.offer", "pending");
    }

    public void answerOffer(boolean active) {
        prefs.edit()
                .putBoolean("sub.active", active)
                .putString("sub.offer", "answered")
                .apply();
        emit();
    }

    public void viewTerms() {
        prefs.edit().putBoolean("sub.terms_viewed", true).apply();
        emit();
    }

    public String toJson() {
        return "{"
                + "\"location.precise\":" + precise()
                + ",\"location.prompt\":\"" + prompt() + "\""
                + ",\"sub.active\":" + subActive()
                + ",\"sub.offer\":\"" + offer() + "\""
                + ",\"sub.terms_viewed\":" + prefs.getBoolean("sub.terms_viewed", false)
                + "}";
    }

    /** Logcat oracle fallback: `adb logcat -s CIRCLE_STATE`. */
    public void emit() {
        Log.i(TAG, toJson());
    }
}
